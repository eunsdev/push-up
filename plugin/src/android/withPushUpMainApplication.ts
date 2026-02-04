import { readFile, writeFile, access } from 'fs/promises';
import { AndroidConfig, ConfigPlugin, withDangerousMod } from "@expo/config-plugins";

const importsToAdd = `
import android.util.Log
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
`.trim();

const cachedBundleField = `
  private var cachedBundleFile: File? = null
`.trim();

const getJSBundleFileOverride = `
        override fun getJSBundleFile(): String? {
          cachedBundleFile?.let {
            Log.d("PushUp", "Use bundle: \${it.absolutePath}")
            return it.absolutePath
          }
          Log.d("PushUp", "Use embedded bundle")
          return super.getJSBundleFile()
        }

`.trim();

const fetchBundleMethod = `
  private fun fetchBundle() {
    val latch = CountDownLatch(1)

    Thread {
      try {
        val bundleId = packageName
        val baseUrl = getString(R.string.PushupHost)

        val client = OkHttpClient.Builder()
          .connectTimeout(3, TimeUnit.SECONDS)
          .readTimeout(3, TimeUnit.SECONDS)
          .build()

        val request = Request.Builder()
          .url("$baseUrl/v1/bundle")
          .header("X-Bundle-ID", bundleId)
          .build()

        val response = client.newCall(request).execute()
        if (!response.isSuccessful) return@Thread

        val json = JSONObject(response.body!!.string())
        val bundleUrl = json.getString("bundleUrl")

        val bundleReq = Request.Builder().url(bundleUrl).build()
        val bundleRes = client.newCall(bundleReq).execute()

        val file = File(filesDir, "main.jsbundle")
        file.writeBytes(bundleRes.body!!.bytes())

        cachedBundleFile = file
        Log.d("BundleDownloader", "Downloaded bundle → \${file.absolutePath}")

      } catch (e: Exception) {
        Log.e("BundleDownloader", "Bundle fetch failed", e)
      } finally {
        latch.countDown()
      }
    }.start()

    latch.await(3, TimeUnit.SECONDS)
  }
`.trim();

const modifyMainApplication = (contents: string): string => {
  // 1. Add imports after package declaration
  if (!contents.includes("import okhttp3.OkHttpClient")) {
    contents = contents.replace(
      /(package [a-z.]+\n)/,
      `$1${importsToAdd}\n\n`
    );
  }

  // 2. Add cachedBundleFile field after class declaration
  if (!contents.includes("private var cachedBundleFile")) {
    contents = contents.replace(
      /(class MainApplication : Application\(\), ReactApplication \{)/,
      `$1\n${cachedBundleField}\n`
    );
  }

  // 3. Add getJSBundleFile override after getPackages
  if (!contents.includes("override fun getJSBundleFile()")) {
    contents = contents.replace(
      /(override fun getPackages\(\): List<ReactPackage> =[\s\S]*?\})/,
      `$1\n\n${getJSBundleFileOverride}`
    );
  }

  // 4. Add fetchBundle() call at the start of onCreate
  if (!contents.includes("fetchBundle()")) {
    contents = contents.replace(
      /override fun onCreate\(\) \{\s*super\.onCreate\(\)/,
      match => `${match}\n    fetchBundle()`
    );
  }

  // 5. Add fetchBundle method before reactHost property
  if (!contents.includes("private fun fetchBundle()")) {
    contents = contents.replace(
      /(override val reactHost: ReactHost)/,
      `${fetchBundleMethod}\n\n  $1`
    );
  }



  return contents;
};

const withPushUpMainApplication: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const fileInfo = await AndroidConfig.Paths.getMainApplicationAsync(
        config.modRequest.projectRoot
      );
      
      let contents = await readFile(fileInfo.path, "utf-8");
      contents = modifyMainApplication(contents);
      await writeFile(fileInfo.path, contents);
      
      return config;
    }
  ]);
};

export default withPushUpMainApplication;