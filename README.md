# Guide — Agent-to-Agent Communication

**Salesforce Agentforce ⇄ Microsoft Copilot Studio**

A clear, step-by-step developer guide to connect a Salesforce Agentforce to a published Microsoft Copilot Studio Agent.


---

## Overview

This integration pattern lets a Salesforce Agentforce **invoke an Apex action**, which calls an **Express API bridge**, which in turn calls a **published Copilot Studio Agent**. Flow:

1. Copilot Studio Agent (published & configured to “Authenticate with Microsoft”)
    
2. Azure App Registration (service principal + permissions + secret)
    
3. Express API Server (bridge that uses the App Registration to auth & invoke the Copilot)
    
4. Salesforce Apex @InvocableMethod that calls the API server
    
5. Agentforce Action that invokes the Apex method
    

---

## Prerequisites

- Azure subscription & permissions to create App Registrations & grant admin consent.
    
- Access to Copilot Studio and permission to create/publish Agents.
    
- Salesforce org with Agentforce installed and permission to create Apex classes and Agentforce Actions.
    
- Node.js + npm on the machine where you run the Express API (or a host to deploy it).
    
- Git access to clone the bridge repo.
    

---

## Quick glossary

- **Copilot Studio Agent** — The AI agent published in Microsoft Copilot Studio.
    
- **App Registration** — Azure AD application used to authenticate the API bridge and request the Copilot.
    
- **Express API Server** — The Node/Express app (bridge) that authenticates using the App Registration and forwards requests to Copilot.
    
- **Apex @InvocableMethod** — Salesforce Apex method which Agentforce calls as an action.
    

---

# Detailed Steps

## Step 1 — Create & Publish Copilot Studio Agent

**Purpose:** Create the Copilot that will answer the financial/organizational queries.

**Navigation**

1. Open **Copilot Studio** (your tenant).
    
2. **Create → New Agent** (follow your org’s naming conventions).
    
3. Configure knowledge sources, skills, and prompts per your requirements.
    
4. **Settings → Security → Authentication** → **Select: Authenticate with Microsoft**.
    
    - This setting ensures the Copilot accepts requests authenticated with your Azure AD token.
        
5. **Publish** the Agent (version your production/dev environments appropriately).
    

**Verification**

- After publishing, note the `agentIdentifier`/schema name and `environmentId` (you will need both for the API bridge `.env`).
    

**Image placeholder**  
`[Copilot Studio Agent Settings image]` — replace: `https://example.com/images/copilot_security_authenticate_with_microsoft.png`

---

## Step 2 — App Registration (Azure AD)

**Purpose:** Create or reuse an App Registration to allow the Express bridge to obtain tokens and call the Copilot/Power Platform APIs.

**Navigation**

1. Go to **Azure Portal** → **Azure Active Directory (Entra ID)** → **App registrations**.
    
2. Either **Open the existing registration** for the Copilot integration or **New registration**.
    
    - **Name:** Meaningful (e.g., `Copilot-Studio-Bridge-API`)
        
    - **Supported account types:** Choose based on your tenant strategy. For same-tenant Copilot use: **Accounts in this organizational directory only**.
        
    - **Redirect URI:** _(Add later — see Step 4)_
        

**API Permissions**

1. In the App Registration, go to **API permissions → Add a permission**.
    
2. Add the permissions your Copilot and Power Platform calls need (see the example image).
    
    - _Add the exact permissions shown in your organizational screenshot._
        
3. Click **Grant admin consent for** .
    

**Image placeholder**  
`[api_permissions_img]` — replace: `https://example.com/images/api_permissions_placeholder.png`

**Power Platform missing?**  
If **Power Platform API** is not available in the portal, run this in Azure PowerShell:

```powershell
# Install the Microsoft Entra module (if not installed)
Install-Module AzureAD

Connect-AzureAD
New-AzureADServicePrincipal -AppId 8578e004-a5c6-46e7-913e-12f58912df43 -DisplayName "Power Platform API"
```

_(This creates a service principal entry for Power Platform so you can select the permission.)_

**Certificates & Secrets**

1. Go to **Certificates & secrets → New client secret**.
    
2. Create a secret, copy the value immediately — you **won’t** be able to see it again.
    
    - Store it securely (Key Vault, secrets manager, or encrypted environment store).
        

**Notes**

- Record: `tenantId`, `appClientId` (Application (client) ID), and the client secret. These go in the API bridge `.env`.
    

---

## Step 3 — Run API Server (Express bridge)

**Purpose:** The Express app authenticates using Azure AD and forwards queries to the Copilot Studio Agent.

**Repository**

- Clone the bridge repository:  [Link](https://github.com/Mohit-Harsh/CopilotStudioAgentAPI.git)    

**Environment variables**  
Create a `.env` file at the project root with:

```python
environmentId="" # Environment ID of environment with the CopilotStudio App.
agentIdentifier="" # Schema Name of the Copilot to use
tenantId="" # Tenant ID of the App Registration used to login (same tenant as Copilot).
appClientId="" # App (Client) ID of the App Registration used to login (same tenant).
CLIENTSECRET="" # Client Secret generated in Azure
```

**Local run**

1. `npm install`
    
2.  `npm run start`    

**Production**

- Deploy to a secure host (Azure App Service, AWS, GCP, Heroku, etc.). Ensure HTTPS and proper firewall rules.

---

## Step 4 — Configure Redirect URI

**Purpose:** Allow the App Registration to correctly redirect flow to your API server.

1. **App Registration**

	- Go to **Azure Portal** → Open **App Registration** → select your **App** → go to **Authentication**.
		
	- Click **Add a platform**.
		
	- Select **Mobile and desktop applications**.
		
	- Under **Redirect URIs** click **Add a Redirect URI** and paste your **Server URL** (use the exact value your app will call).
	
	- Click **Save** to persist changes.

2. **index.ts**

	- Go to **src** → **index.ts** → replace the **redirectUri** value with the **Server URL**

	```Java
		const tokenRequest = {
		scopes: ['https://api.powerplatform.com/.default'],
		redirectUri: <your_server_url>,
	  }
	```


---

## Step 5 — Apex Class (Salesforce)

**Purpose:** Provide a Salesforce server-side method (with `@InvocableMethod`) that calls the Express API.

**Best practice**

- Use `HttpRequest` and configure endpoint and headers.
    
- Implement retries and proper exception handling.
    
- For production, do not embed secrets in Apex; authenticate using OAuth from the Express bridge (Apex only forwards requests). Salesforce should call your Express endpoint over HTTPS.
    

**Navigation to create Apex**

1. Salesforce Setup → **Developer Console** (or Setup → Apex Classes → New).
    
2. Create a new Apex class with a public, static `@InvocableMethod` method that accepts the input from Agentforce and calls the Express API.
    
```Java
public class CopilotAgentInvoke 	
{
	public class RequestWrapper
    {
        @InvocableVariable(label='query')
        public String query;
    }
    
    @InvocableMethod(label='Invoke Copilot Studio Agent')
    public static List<Response> invoke(List<RequestWrapper> requests)
    { 
        List<Response> responses = new List<Response>();
        
     	for(RequestWrapper request: requests)
        {
            HttpRequest req = new HttpRequest();
            req.setMethod('POST');
            
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(120000);
            
           
            req.setEndpoint('https://copilotstudioagentapi.loca.lt/start');
            req.setBody(JSON.serialize(new Map<String, Object>{
                'query' => request.query
                    }));
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            System.debug(res);
            
            if(res.getStatusCode() == 200)
            {
                Map<String,Object> jsonResponse = (Map<String, Object>)JSON.deserializeUntyped(res.getBody());
                Response result = new Response();
                result.message = (String)jsonResponse.get('message');
                result.conversationId = (String)jsonResponse.get('conversationId');
                responses.add(result);
            }
        }
        
        return responses;
    }

    public class Response 
    {
        @InvocableVariable 
        public String conversationId;
        @InvocableVariable 
        public String message;
    }

    
}
```

**Configure Remote Site Settings**

- Add the Express Server URL to **Remote Site Settings**.
    

---

## Step 6 — Create Agentforce Action

**Purpose:** Wire the Apex method into an Agentforce Action so the Agentforce agent can call it.

**Navigation**

1. Salesforce Setup → Quick Find → **Agentforce Assets**.
    
2. **Actions → New Action**.
    
    - **Type:** Apex
        
    - **Apex Class:** Select the class you created in Step 5.
        
    - Configure inputs and outputs mapping (match the Invocable method parameter structure).
        
3. Save & publish the Action.
    

**Usage**

- Add the Action to the **Agentforce Agent** or **Prompt Template** where you want the call to Copilot Studio to be made. 
 
- The Action will invoke the Apex method, which calls your Express bridge, which then calls Copilot and returns the response.
    

---

# Testing & Verification Checklist

1. **Copilot Published:** Agent status is `Published` and `Authenticate with Microsoft` is enabled.
    
2. **App Registration:** `tenantId`, `appClientId`, and `CLIENTSECRET` exist and are recorded. Admin consent granted.
    
3. **Redirect URIs:** Azure UI redirect URI matches `src/index.ts` exactly.
    
4. **Express Bridge:** Starts successfully, exposes health endpoint (e.g., `/health`) and logs successful token acquisition.
    
5. **Apex to Bridge:** Use Postman or a Salesforce test class to call the Apex Invocable and confirm it reaches the Express server.
    
6. **End-to-End:** From Agentforce, run the flow and confirm Copilot returns the expected response to Salesforce.
    
7. **Error Cases:** Simulate expired secret and confirm graceful error handling/logging.
    

---

# Common Errors & Fixes

- **401 Unauthorized / invalid_client / invalid_grant**
    
    - Check `appClientId`, `CLIENTSECRET`, and `tenantId`. Ensure secret is not expired. Ensure App Registration is in the same tenant as Copilot.
        
- **redirect_uri_mismatch**
    
    - Ensure exact match between Azure App Registration redirect URI and the redirect configured in `src/index.ts`.
        
- **Power Platform API not listed**
    
    - Use the Azure PowerShell snippet (see Step 2) to add the service principal.
        
- **Connection refused from Salesforce to API**
    
    - Ensure API host is publicly reachable or whitelist Salesforce IPs, and the endpoint is HTTPS. For dev, use a tunneling service (ngrok/localtunnel) but prefer hosted deployments for production.
        
- **CORS Issues in Browser-based flows**
    
    - Ensure CORS is configured properly on your Express server for the client origins used.
        

---
