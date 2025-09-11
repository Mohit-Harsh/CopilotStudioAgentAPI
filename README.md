# Agentforce ↔️ Copilot Studio Integration

## 📑 Contents

- [Overview](#overview)
- [Problem Statement and Solution](#problem-statement-and-solution)
- [Pros & Cons](#pros-and-cons)
- [Setup Guide](#setup-guide)
  - 1. [Azure User Creation](#1-azure-user-creation)
  - 2. [Copilot Studio Agent Setup](#2-copilot-studio-agent-setup)
  - 3. [App Registration in Azure](#3-app-registration-in-azure)
  - 4. [Salesforce Auth Provider](#4-salesforce-auth-provider)
  - 5. [External Credentials in Salesforce](#5-external-credentials-in-salesforce)
  - 6. [Named Credentials in Salesforce](#6-named-credentials-in-salesforce)
  - 7. [Apex Integration](#7-apex-integration)
  - 8. [Express.js Server Setup](#8-expressjs-server-setup)
- [Running the Express Server](#️-express-server-setup)

---

## Overview

This project enables secure and role-based communication between Salesforce Agentforce and Microsoft Copilot Studio Agent. It leverages Microsoft Agents SDK, Salesforce Named Credentials, and Azure App Registration to ensure seamless integration and access control to Microsoft resources like SharePoint.

---

Here’s a professionally rewritten version of your **Problem Statement and Solution** section, formatted in a GitHub documentation style:

---

## Problem Statement and Solution

### Problem

Directly connecting **Salesforce Agentforce** to Microsoft services like **SharePoint** using native **Connectors (Beta)** can lead to unintended exposure of sensitive Microsoft data within the Salesforce environment. This approach lacks fine-grained control over data access and does not support robust role-based access control (RBAC).

### Solution

To address this, we implemented a secure **Agent-to-Agent communication** model between **Salesforce Agentforce** and **Microsoft Copilot Studio Agent**. Instead of accessing Microsoft data directly, Salesforce delegates the request to a Copilot Agent that has controlled access to Microsoft resources.

Key components of the solution:

- **Salesforce Named Credentials** are used to authenticate Microsoft users securely via OAuth 2.0, enabling **role-based access control**.
- An **Express.js server** acts as a middleware, receiving authenticated requests from Salesforce and invoking the **Copilot Studio Agent** using the **Microsoft Agents SDK**.
- The **access token** is automatically injected into the request header by Salesforce Named Credentials, ensuring secure and seamless communication.

This architecture ensures that Microsoft data remains protected, access is governed by Azure roles, and the integration remains modular and scalable.

---

## Pros and Cons

| Pros | Cons |
|------|------|
| ✅ Secure OAuth2-based communication | ⚠️ Requires setup across multiple platforms |
| ✅ Role-based access to Microsoft resources | ⚠️ Initial configuration is time-consuming |
| ✅ Scalable and modular | ⚠️ Requires maintenance of secrets and tokens |
| ✅ Uses standard SDKs and APIs | ⚠️ Dependency on Microsoft and Salesforce platform availability |

---

## Setup Guide

### 1. Azure User Creation

Create a new member user in Azure Active Directory.

| Parameter | Value |
|----------|-------|
| User Type | Member |

---

### 2. Copilot Studio Agent Setup

- Create a new agent in Microsoft Copilot Studio.
- Share the agent with the Azure user created above.
- Copy the following information from `Settings → Advanced Settings → Metadata` for further steps.

| **Parameter**     | **Description**                                                                                                                                     |
|-------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| Environment ID | A unique identifier for the Power Platform environment where the Copilot Studio Agent is hosted. It defines the scope for data, apps, and agents. |
| Schema Name    | The internal name of the solution or schema that contains the agent and its components. Used for referencing entities and configurations.          |
| App ID         | The application (client) ID registered in Azure AD that represents the Copilot Studio Agent for authentication and API access.                    |
| Tenant ID      | The Azure Active Directory tenant identifier where the app and user accounts are managed. It ensures the app is scoped to the correct organization. |

---

### 3. App Registration in Azure

Register a new app or use an existing one.

| Parameter | Value |
|----------|-------|
| Name | _[ A user-friendly name for the App]_
| Supported account types | _[Accounts in this organizational directory only (Single Tenant)]_ |
| Redirect URI | _[Salesforce Auth Provider Callback URL]_ |

**Required API Permissions**

#### Microsoft Graph
- `openid`
- `offline_access`

#### SharePoint
- `Sites.Read.All` (Delegated)

#### Power Platform API
- `CopilotStudio.Copilots.Invoke` (Delegated)

> 💡 If Power Platform API is not available, run the following PowerShell command:
```powershell
#Install the Microsoft Entra the module
Install-Module AzureAD

Connect-AzureAD
New-AzureADServicePrincipal -AppId 8578e004-a5c6-46e7-913e-12f58912df43 -DisplayName "Power Platform API"
```

Store the below details for further use:

| **Parameter**     | **Description**                                                                                                                                       |
|-------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| Client ID      | The unique identifier (Application ID) assigned to your registered app in Azure Active Directory. Used by external services to identify the app.     |
| Client Secret  | A confidential string generated during app registration. It acts like a password and is used to authenticate the app when requesting tokens. Create a new secret if not available/expired.        |
| Tenant ID      | The unique identifier of your Azure Active Directory tenant. It defines the organizational boundary for identity and access management. |

---

### 4. Salesforce Auth Provider

Create a new Auth Provider in Salesforce.

| Parameter | Value |
|----------|-------|
| Consumer Key | _[Client ID]_ |
| Consumer Secret | _[Client Secret]_ |
| Token Endpoint | `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` |
| Authorization Endpoint | `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize` |
| Callback URL | Copy & Paste in: `Azure App → Authentication → +Add Platform → Web → Redirect URI` |

---

### 5. External Credentials in Salesforce

Create an External Credential using the Auth Provider.



| **Parameter**               | **Description**                                                                                                                                           |
|-----------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Label                   | A user-friendly name for the External Credential used within Salesforce.                                                                                 |
| Name (API Name)         | The unique identifier used in Apex and configuration to reference the credential.                                                                         |
| Authentication Protocol | **OAuth 2.0**.
| Identity Provider | Auth Provider |
| Auth Provider           | The previously created Auth Provider.                     |
| Scope                   | **Blank**. |
| Authentication Flow Type     | **Browser Flow**   


Create the following **Named Principals** and **Authenticate**.

| Principal | Description |
|----------|-------------|
| `https://api.powerplatform.com/.default` | Access to Power Platform |
| `https://graph.microsoft.com/.default` | Access to Microsoft Graph |

---

### 6. Named Credentials in Salesforce

Create a Named Credential using the External Credential.

| **Parameter** | **Value** |
|----------|-------|
| URL | `https://<your-express-server-url>` |
| External Credential | _[ previously created ]_ |
| Enable Callouts     | _[ Enabled ]_

---

### 7. Apex Integration

Use Apex to send HTTP requests to the Express.js server.

- Use `@InvocableMethod` to expose the method as an Agent Action.
- Use Named Credential for callout to automatically inject access token.

```java
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
            req.setEndpoint('callout:AlphaFin/invoke');
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(120000);
            req.setMethod('POST');
            req.setBody(JSON.serialize(new Map<String,Object>{
                'query' => request.query
            }));
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            System.debug(res.getBody());
            
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

---

### 8. Express.js Server Setup

This server uses Microsoft Agents SDK to invoke the Copilot Studio Agent.

| Requirement | Description |
|-------------|-------------|
| SDK | Microsoft Agents SDK |
| Endpoint | `/invoke` |
| Token | Extracted from Salesforce request header |
| Remote Site Settings | Add server URL in Salesforce |

---

## ▶️ Express Server Setup

#### Clone Repository

```bash
# Clone Repository
git clone https://github.com/Mohit-Harsh/CopilotStudioAgentAPI.git

# Change Directory
cd CopilotStudioAgentAPI
```

#### Create a `.env` file

```powershell
environmentId= #Copilot Studio Agent Environment ID
agentIdentifier= #Copilot Studio Agent Schema Name
tenantId= #Microsoft Tenant ID
appClientId= #Copilot Studio Agent Client ID

# cloud= # PowerPlatformCloud. eg 'Cloud | Gov'
# customPowerPlatformCloud= # Power Platform API endpoint to use if Cloud is configured as "Other"
# agentType="" # AgentType enum. eg 'Published'

DEBUG=copilot-studio-client:error
```
#### Start the server locally

```bash
# Install dependencies
npm install

# Start the server
npm start
```

> 💡Ensure the server is publicly accessible and the URL is added in:
> - Salesforce Remote Site Settings
> - Azure App Registration → Redirect URI


---




