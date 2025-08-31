// Import express
import express from "express";

import * as msal from '@azure/msal-node'
import { Activity, ActivityTypes, CardAction } from '@microsoft/agents-activity'
import { ConnectionSettings, loadCopilotStudioConnectionSettingsFromEnv, CopilotStudioClient, CopilotStudioConnectionSettings } from '@microsoft/agents-copilotstudio-client'
import pkg from '@microsoft/agents-copilotstudio-client/package.json' with { type: 'json' }
import readline from 'readline'
import open from 'open'
import os from 'os'
import path from 'path'

import { MsalCachePlugin } from './msalCachePlugin.js'


async function acquireToken (settings: ConnectionSettings): Promise<string> {
  const msalConfig = {
    auth: {
      clientId: settings.appClientId,
      authority: `https://login.microsoftonline.com/${settings.tenantId}`,
      clientSecret: process.env.CLIENTSECRET,
    },
    cache: NULL,
    system: {
      loggerOptions: {
        loggerCallback (loglevel: msal.LogLevel, message: string, containsPii: boolean) {
          if (!containsPii) {
            console.log(loglevel, message)
          }
        },
        piiLoggingEnabled: false,
        logLevel: msal.LogLevel.Verbose,
      }
    }
  }
  const pca = new msal.PublicClientApplication(msalConfig)
  const tokenRequest = {
    scopes: ['https://api.powerplatform.com/.default'],
    redirectUri: 'https://copilotstudioagentapi.onrender.com',
  }
  let token
  try {
    const accounts = await pca.getAllAccounts()
    if (accounts.length > 0) {
      const response2 = await pca.acquireTokenSilent({ account: accounts[0], scopes: tokenRequest.scopes })
      token = response2.accessToken
    } else {
      token = ""
    }
  } catch (error) {
    console.error('Error acquiring token interactively:', error)
    token=""
  }
  return token
}

const createClient = async (): Promise<CopilotStudioClient> => {

  const settings = loadCopilotStudioConnectionSettingsFromEnv()

  const token = await acquireToken(settings)
  console.log('Token: ',token)
  const copilotClient = new CopilotStudioClient(settings, token)
  console.log(`Copilot Studio Client Version: ${pkg.version}, running with settings: ${JSON.stringify(settings, null, 2)}`)
  return copilotClient

}

async function askQuestion(copilotClient: CopilotStudioClient, conversationId: string, query: string|undefined)
{
  if(query && query.length > 0)
  {
    const replies = await copilotClient.askQuestionAsync(query, conversationId);
    let response = ""
    replies.forEach((act: Activity) => {
      if (act.type === ActivityTypes.Message) 
      {
        response += `\n${act.text}`
        act.suggestedActions?.actions.forEach((action: CardAction) => response += action.value)
      } 
      else if (act.type === ActivityTypes.EndOfConversation) 
      {
        response += `\n${act.text}`
      }
    })
    return response
  }
  return null
}

// Create express app
const app = express();


// Middleware to parse JSON requests
app.use(express.json());
app.use((req, res, next) => {
  console.log('Request Recieved: ',req);
  res.header("Access-Control-Allow-Origin", "*"); // allow all origins
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  next();
});


app.post("/continue", async(req,res) => {

  const { query,conversationId } = req.body;

  if(query.length >0 && conversationId.length>0)
  {
    const copilotClient = await createClient()
    const act: Activity = await copilotClient.startConversationAsync(true)
    // console.log('\nSuggested Actions: ')
    // act.suggestedActions?.actions.forEach((action: CardAction) => console.log(action.value))
    const response = await askQuestion(copilotClient,conversationId,query);
    
    res.send(response);
  }

})

// Example API endpoint
app.post("/start", async (req, res) => {

  const { query } = req.body;

  const copilotClient = await createClient()
  const act: Activity = await copilotClient.startConversationAsync(true)
  // console.log('\nSuggested Actions: ')
  // act.suggestedActions?.actions.forEach((action: CardAction) => console.log(action.value))
  const response = await askQuestion(copilotClient, act.conversation?.id!, query);
  
  res.json({
    "message":response,
    "conversationId":act.conversation?.id
  })

});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});




