/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import fs from 'fs';
export class MsalCachePlugin {
    constructor(cacheLocation) {
        this.cacheLocation = '';
        this.cacheLocation = cacheLocation;
    }
    async beforeCacheAccess(tokenCacheContext) {
        return new Promise((resolve, reject) => {
            if (fs.existsSync(this.cacheLocation)) {
                fs.readFile(this.cacheLocation, 'utf-8', (error, data) => {
                    if (error) {
                        reject(error);
                    }
                    else {
                        console.log('loading token from cache: ', this.cacheLocation);
                        tokenCacheContext.tokenCache.deserialize(data);
                        resolve();
                    }
                });
            }
            else {
                fs.writeFile(this.cacheLocation, tokenCacheContext.tokenCache.serialize(), (error) => {
                    if (error) {
                        reject(error);
                    }
                    console.log('caching token at: ', this.cacheLocation);
                    resolve();
                });
            }
        });
    }
    async afterCacheAccess(tokenCacheContext) {
        return new Promise((resolve, reject) => {
            if (tokenCacheContext.cacheHasChanged) {
                fs.writeFile(this.cacheLocation, tokenCacheContext.tokenCache.serialize(), (error) => {
                    if (error) {
                        reject(error);
                    }
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }
}
//# sourceMappingURL=msalCachePlugin.js.map