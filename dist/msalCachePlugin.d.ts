import { ICachePlugin, TokenCacheContext } from '@azure/msal-node';
export declare class MsalCachePlugin implements ICachePlugin {
    private cacheLocation;
    constructor(cacheLocation: string);
    beforeCacheAccess(tokenCacheContext: TokenCacheContext): Promise<void>;
    afterCacheAccess(tokenCacheContext: TokenCacheContext): Promise<void>;
}
