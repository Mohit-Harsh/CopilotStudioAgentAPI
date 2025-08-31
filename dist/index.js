// Import express
import express from "express";
import * as msal from '@azure/msal-node';
import { ActivityTypes } from '@microsoft/agents-activity';
import { loadCopilotStudioConnectionSettingsFromEnv, CopilotStudioClient } from '@microsoft/agents-copilotstudio-client';
import pkg from '@microsoft/agents-copilotstudio-client/package.json' with { type: 'json' };
import os from 'os';
import path from 'path';
import { MsalCachePlugin } from './msalCachePlugin.js';
async function acquireToken(settings) {
    const msalConfig = {
        auth: {
            clientId: settings.appClientId,
            authority: `https://login.microsoftonline.com/${settings.tenantId}`,
            clientSecret: process.env.CLIENTSECRET,
        },
        cache: {
            cachePlugin: new MsalCachePlugin(path.join(os.tmpdir(), 'mcssample.tockencache.json'))
        },
        system: {
            loggerOptions: {
                loggerCallback(loglevel, message, containsPii) {
                    if (!containsPii) {
                        console.log(loglevel, message);
                    }
                },
                piiLoggingEnabled: false,
                logLevel: msal.LogLevel.Verbose,
            }
        }
    };
    const pca = new msal.PublicClientApplication(msalConfig);
    const tokenRequest = {
        scopes: ['https://api.powerplatform.com/.default'],
        redirectUri: 'http://localhost',
    };
    let token;
    try {
        const accounts = await pca.getAllAccounts();
        if (accounts.length > 0) {
            const response2 = await pca.acquireTokenSilent({ account: accounts[0], scopes: tokenRequest.scopes });
            token = response2.accessToken;
        }
        else {
            token = "";
        }
    }
    catch (error) {
        console.error('Error acquiring token interactively:', error);
        token = "";
    }
    return token;
}
const createClient = async () => {
    const settings = loadCopilotStudioConnectionSettingsFromEnv();
    const token = await acquireToken(settings);
    const copilotClient = new CopilotStudioClient(settings, token);
    console.log(`Copilot Studio Client Version: ${pkg.version}, running with settings: ${JSON.stringify(settings, null, 2)}`);
    return copilotClient;
};
async function askQuestion(copilotClient, conversationId, query) {
    if (query && query.length > 0) {
        const replies = await copilotClient.askQuestionAsync(query, conversationId);
        let response = "";
        replies.forEach((act) => {
            var _a;
            if (act.type === ActivityTypes.Message) {
                response += `\n${act.text}`;
                (_a = act.suggestedActions) === null || _a === void 0 ? void 0 : _a.actions.forEach((action) => response += action.value);
            }
            else if (act.type === ActivityTypes.EndOfConversation) {
                response += `\n${act.text}`;
            }
        });
        return response;
    }
    return null;
}
// Create express app
const app = express();
// Middleware to parse JSON requests
app.use(express.json());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); // allow all origins
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    next();
});
app.post("/continue", async (req, res) => {
    const { query, conversationId } = req.body;
    if (query.length > 0 && conversationId.length > 0) {
        const copilotClient = await createClient();
        const act = await copilotClient.startConversationAsync(true);
        // console.log('\nSuggested Actions: ')
        // act.suggestedActions?.actions.forEach((action: CardAction) => console.log(action.value))
        const response = await askQuestion(copilotClient, conversationId, query);
        res.send(response);
    }
});
// Example API endpoint
app.post("/start", async (req, res) => {
    var _a, _b;
    const { query } = req.body;
    const copilotClient = await createClient();
    const act = await copilotClient.startConversationAsync(true);
    // console.log('\nSuggested Actions: ')
    // act.suggestedActions?.actions.forEach((action: CardAction) => console.log(action.value))
    const response = await askQuestion(copilotClient, (_a = act.conversation) === null || _a === void 0 ? void 0 : _a.id, query);
    res.json({
        "message": response,
        "conversationId": (_b = act.conversation) === null || _b === void 0 ? void 0 : _b.id
    });
});
// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map