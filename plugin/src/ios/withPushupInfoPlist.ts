import { ConfigPlugin, withInfoPlist } from '@expo/config-plugins';

type PushupBundleConfig = {
  pushupHost: string;
};

export const withPushupInfoPlist: ConfigPlugin<PushupBundleConfig> = (config, { pushupHost }) => {
  return withInfoPlist(config, config => {
    config.modResults.PushupHost = pushupHost;
    
    if (!config.modResults.NSAppTransportSecurity) {
      config.modResults.NSAppTransportSecurity = {};
    }
    
    const ats = config.modResults.NSAppTransportSecurity as Record<string, any>;
    
    if (!ats.NSExceptionDomains) {
      ats.NSExceptionDomains = {};
    }
    
    const exceptionDomains = ats.NSExceptionDomains as Record<string, any>;
    
    try {
      const url = new URL(pushupHost);
      const domain = url.hostname;
      
      exceptionDomains[domain] = {
        NSExceptionAllowsInsecureHTTPLoads: true,
        NSIncludesSubdomains: true,
      };
    } catch (error) {
      console.warn('Invalid pushupHost URL, using default localhost settings');
      exceptionDomains['localhost'] = {
        NSExceptionAllowsInsecureHTTPLoads: true,
      };
    }
    
    return config;
  });
};