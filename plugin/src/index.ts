import { ConfigPlugin, withPlugins } from "@expo/config-plugins";

import { withPushUpAppDelegate } from "./ios/appDelegate";
import { withPushupInfoPlist } from "./ios/withPushupInfoPlist";
import withPushUpMainApplication from "./android/withPushUpMainApplication";
import { WithPushUpUpdateStringsXml } from "./android/withPushUpUpdateStringsXml";

interface PluginProps {
  pushupHost: string; 
}

const withPushupBundle: ConfigPlugin<PluginProps> = (config, props) => {
  return withPlugins(config, [
    // iOS
    withPushUpAppDelegate,
    [
      withPushupInfoPlist,
      {
        pushupHost: props.pushupHost,
      },
    ],
    // Android
    [
      WithPushUpUpdateStringsXml,
      props.pushupHost
    ],
    withPushUpMainApplication
  ]);
};

export default withPushupBundle;