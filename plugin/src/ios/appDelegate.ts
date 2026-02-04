import {
  ConfigPlugin,
  IOSConfig,
  withDangerousMod,
} from "@expo/config-plugins";
import { readFile, writeFile, access } from 'fs/promises';

const methodInvocationBlock = `
    private var cachedBundleUrl: URL?
    
    override init() {
        super.init()
        fetchBundleUrl()
    }

    private func fetchBundleUrl() {
        guard let infoDictionary = Bundle.main.infoDictionary,
              let pushupHost = infoDictionary["PushupHost"] as? String,
              let bundleId = Bundle.main.bundleIdentifier else {
            print("Failed to load PushupHost or Bundle ID from Info.plist")
            return
        }
        
        guard let url = URL(string: "\\(pushupHost)/v1/bundle") else {
            print("Invalid URL: \\(pushupHost)/v1/bundle")
            return
        }
        
        print("Fetching bundle from: \\(url)")
        print("Bundle ID: \\(bundleId)")
        
        let semaphore = DispatchSemaphore(value: 0)
        
        DispatchQueue.global(qos: .userInitiated).async {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue(bundleId, forHTTPHeaderField: "X-Bundle-ID")
            request.timeoutInterval = 3
            
            let task = URLSession.shared.dataTask(with: request) { data, response, error in
                defer { semaphore.signal() }
                
                if let error = error {
                    print("Network error: \\(error.localizedDescription)")
                    return
                }
                
                guard let data = data else {
                    print("No data received")
                    return
                }
                
                do {
                    if let jsonObject = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let bundleUrlString = jsonObject["bundleUrl"] as? String,
                       let bundleUrl = URL(string: bundleUrlString) {
                        self.cachedBundleUrl = bundleUrl
                        print("Fetched bundle URL: \\(bundleUrl)")
                    } else {
                        print("Invalid JSON response")
                    }
                } catch {
                    print("JSON parsing error: \\(error.localizedDescription)")
                }
            }
            
            task.resume()
        }
        
        _ = semaphore.wait(timeout: .now() + 3)
    }`;

const bundleURLOverride = `
    override func bundleURL() -> URL? {
        if let cached = cachedBundleUrl {
            print("Success loaded bundle from server")
            return cached
        } else {
            print("Use default built .bundle")
            #if DEBUG
                return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
            #else
                return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
            #endif
        }
    }`;

const sourceURLOverride = `
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    return bundleURL()
  }`;

export function modifyAppDelegateSwift(contents: string): string {
  const classPattern = /class ReactNativeDelegate: ExpoReactNativeFactoryDelegate \{/;
  
  if (!classPattern.test(contents)) {
    console.warn('ReactNativeDelegate class not found');
    return contents;
  }

  if (contents.includes('private var cachedBundleUrl: URL?')) {
    console.log('Already modified');
    return contents;
  }

  contents = contents.replace(
    classPattern,
    `class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {${methodInvocationBlock}`
  );

  const bundleURLPattern = /override func bundleURL\(\) -> URL\? \{[\s\S]*?\n  \}/;
  if (bundleURLPattern.test(contents)) {
    contents = contents.replace(bundleURLPattern, bundleURLOverride.trim());
  } else {
    contents = contents.replace(
      /override func sourceURL/,
      `${bundleURLOverride}\n\n  override func sourceURL`
    );
  }

  const sourceURLPattern = /override func sourceURL\(for bridge: RCTBridge\) -> URL\? \{[\s\S]*?\n  \}/;
  if (sourceURLPattern.test(contents)) {
    contents = contents.replace(sourceURLPattern, sourceURLOverride.trim());
  }

  return contents;
}

export const withPushUpAppDelegate: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const fileInfo = IOSConfig.Paths.getAppDelegate(
        config.modRequest.projectRoot
      );
      let contents = await readFile(fileInfo.path, "utf-8");
      if (fileInfo.language === "objc" || fileInfo.language === "objcpp" ) {
        throw new Error(
          `Cannot add PushUp code to AppDelegate of language "${fileInfo.language}"`
        );
      } else {
        contents = modifyAppDelegateSwift(contents);
      }
      await writeFile(fileInfo.path, contents);

      return config;
    },
  ]);
};
