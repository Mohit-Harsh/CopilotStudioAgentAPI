// Import express
import express from "express";

import * as msal from '@azure/msal-node'
import { Activity, ActivityTypes, CardAction } from '@microsoft/agents-activity'
import { ConnectionSettings, loadCopilotStudioConnectionSettingsFromEnv, CopilotStudioClient } from '@microsoft/agents-copilotstudio-client'
import pkg from '@microsoft/agents-copilotstudio-client/package.json' with { type: 'json' }


const createClient = async (access_token:string): Promise<CopilotStudioClient> => {

  const settings = loadCopilotStudioConnectionSettingsFromEnv()
  //const token = await acquireToken(settings);
  const copilotClient = new CopilotStudioClient(settings,access_token);
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
  res.header("Access-Control-Allow-Origin", "*"); // allow all origins
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  next();
});


app.post("/invoke", async(req,res)=>{

  try 
  {
    // Get Authorization header
    const authHeader = req.headers["authorization"]; // or req.get("authorization")

    if (!authHeader) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }

    // Expected format: "Bearer <token>"
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(400).json({ error: "Invalid Authorization header format" });
    }

    if(req.body == undefined)
    {
      return res.status(500).json({ error: "Request Body is empty" });
    }

    const access_token = parts[1]; // <-- This is your access token
    const {query} = req.body;

    // Create Copilot Client
    const copilotClient = await createClient(access_token);
    
    // Invoke Copilot Studio Agent
    const act: Activity = await copilotClient.startConversationAsync(true);
    const response = await askQuestion(copilotClient, act.conversation?.id!, query);

    // Return Json Response
    res.json({
      "message":response,
      "conversationId":act.conversation?.id
    });
    
  } 
  catch (err) 
  {
    console.error("Error:", err);
    res.status(500).json({ error: "Server error" });
  }
})


// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
