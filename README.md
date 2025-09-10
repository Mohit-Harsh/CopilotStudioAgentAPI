# Agent-to-Agent Integration Guide

**Salesforce Agentforce ⇄ Microsoft Copilot Studio**
Professional, step-by-step developer documentation (no code included).
Placeholders marked where you should insert code snippets, configuration screenshots, or architecture diagrams.

---

## Table of contents

1. [Overview](#overview)
2. [Prerequisites & accounts](#prerequisites--accounts)
3. [High-level architecture](#high-level-architecture)
4. [Step-by-step setup](#step-by-step-setup)

   * [A. Create Azure / Microsoft Entra user](#a-create-azure--microsoft-entra-user)
   * [B. Create Copilot Studio Agent](#b-create-copilot-studio-agent)
   * [C. App registration (Azure)](#c-app-registration-azure)
   * [D. Salesforce: Auth. Provider](#d-salesforce-auth-provider)
   * [E. Salesforce: External Credential(s)](#e-salesforce-external-credentials)
   * [F. Salesforce: Named Credential](#f-salesforce-named-credential)
   * [G. Apex (Agent Action)](#g-apex-agent-action)
   * [H. Express.js bridge (Microsoft Agents SDK)](#h-expressjs-bridge-microsoft-agents-sdk)
   * [I. Misc: Remote site, Redirect URIs & consent](#i-misc-remote-site-redirect-uris--consent)
5. [Security & RBAC notes](#security--rbac-notes)
6. [Troubleshooting checklist & common errors](#troubleshooting-checklist--common-errors)
7. [Placeholders — where to insert code & images](#placeholders-—-where-to-insert-code--images)
8. [References & useful links](#references--useful-links)

---

# Overview

This guide documents a secure flow where Salesforce (Agentforce) invokes an Apex action that calls an Express.js bridge, and that bridge calls a Microsoft Copilot Studio Agent on behalf of the signed-in Microsoft user. Authentication is handled so the Microsoft user’s token (from Salesforce Named Credentials / External Credential) is forwarded to the Express server and used to invoke Copilot Studio via Microsoft’s Agents SDK.

Key outcomes:

* Per-user (delegated) calls to Copilot Studio (each call is scoped to the Microsoft user’s permissions). ([Microsoft Learn][1])
* Copilot Studio invoked from a trusted bridge (Express.js) using the **user** access token forwarded by Salesforce. ([Microsoft Learn][2], [npm][3])

---

# Prerequisites & accounts

* **Azure / Microsoft Entra tenant** with privileges to create users and register apps (User Administrator / App admin). ([Microsoft Learn][4])
* **Salesforce org** with System Administrator access (to create Auth Providers, External Credentials, Named Credentials, Remote Site Settings, Apex, and Agentforce actions). ([Salesforce][5])
* Host for the **Express.js** server (TLS required; publicly reachable by Salesforce).
* Node.js + npm environment for the Express server (the server will use Microsoft’s Agents SDK / CopilotStudio client). ([Microsoft Learn][2], [npm][3])

---

# High-level architecture

1. Salesforce user triggers an Agent action (Apex `@InvocableMethod`).
2. Apex uses a **Named Credential** to call the Express.js server; Salesforce injects (per-user) Microsoft OAuth token into the call. ([Salesforce Developers][6], [Salesforce Ben][7])
3. Express.js receives request + bearer token, uses Microsoft **Agents SDK** / Copilot client to invoke the Copilot Studio Agent with the forwarded token. ([Microsoft Learn][2], [npm][3])
4. Copilot Studio resolves knowledge sources (e.g., SharePoint) using the same user identity — RBAC enforced by Microsoft Graph / SharePoint. ([Microsoft Learn][1])

(Insert architecture diagram here) — **placeholder**.

---

# Step-by-step setup

> Each step contains: purpose, exact navigation (where applicable), and important tips.

---

## A. Create Azure / Microsoft Entra user

**Purpose:** create a Microsoft user (internal or guest) to share the Copilot Studio agent and to test delegated access.

**Navigation (Azure portal):**

1. Sign in to **Microsoft Entra admin center** ([https://portal.azure.com](https://portal.azure.com) → Azure Active Directory / Entra ID).
2. **Identity > Users > All users → New user → Create new user**. Fill `User principal name`, `Display name`, password options. ([Microsoft Learn][4])

**Tips:**

* If the user should be a guest (external), use *Invite external user*.
* Assign any role required for SharePoint or tenant-level actions (least privilege only).

---

## B. Create Copilot Studio Agent

**Purpose:** create the Copilot Studio agent that will be invoked.

**Navigation (Copilot Studio):**

1. Sign in to **Copilot Studio** (Microsoft 365 portal → Copilot Studio).
2. **Create agent** → configure knowledge sources (SharePoint sites), actions, and settings.
3. Note and copy the agent metadata you’ll need later: **environment id**, **schema name**, **app id** (if present), **tenant id**. These values are required by your Express.js integration. ([Microsoft Learn][2])

**Share with user:** share the agent (Viewer or appropriate role) with the Azure user you created so they chat with the agent.

**Tip:** If you plan to embed or integrate via SDK, check **Settings → Security → Authentication** on the Copilot Studio agent (you may choose delegated authentication). ([Microsoft Learn][2])

---

## C. App registration (Azure AD / Entra)

**Purpose:** app that will be used to request tokens and allow Salesforce to authenticate (Auth Provider) and to request delegated scopes.

**Navigation (Azure portal → Entra ID → App registrations):**

1. **New registration** → name, supported account types (choose Work or school accounts).
2. After register: copy **Application (client) ID** and **Directory (tenant) ID**. ([Microsoft Learn][8])
3. **Certificates & secrets** → **New client secret** → copy the secret value now (will be used in Salesforce Auth Provider / External Credential). ([Microsoft Learn][8])

**API permissions (important):**

* Add **delegated** permissions:

  * `openid`, `offline_access` (for OAuth flows/refresh tokens).
  * `Sites.Read.All` (or the least privileged SharePoint/Graph scopes required to access the documents used as knowledge).
  * `CopilotStudio.Copilots.Invoke` — required by the Agents SDK to call Copilot Studio as a user. *(Depending on tenant and SDK release this exact permission may appear as a Copilot / Copilot Studio permission)*. ([Microsoft Learn][1], [npm][3])

**Tip:** After adding delegated permissions, an admin must **Grant consent** (or the user will be prompted on first use). Use the Azure portal’s *Grant admin consent* button where appropriate.

**Note:** : If you don't see Power Platform API showing up in the list when searching by GUID, it's possible that you still have access to it but the visibility isn't refreshed. To force a refresh run the below PowerShell script:

```powershell
#Install the Microsoft Entra the module
Install-Module AzureAD

Connect-AzureAD
New-AzureADServicePrincipal -AppId 8578e004-a5c6-46e7-913e-12f58912df43 -DisplayName "Power Platform API"
```

---

## D. Salesforce: Auth. Provider (Microsoft)

**Purpose:** allow Salesforce to perform OAuth flows with Microsoft (consumer key/secret mapping).

**Navigation (Salesforce Setup):**

1. Setup → **Auth. Providers** → **New** → Provider Type: *OpenID Connect / Microsoft* (or configure manually).
2. Fill **Consumer Key** = *client id*, **Consumer Secret** = *client secret* (copied from App Registration). Set authorize / token endpoints according to Microsoft (use endpoints described in Azure docs). ([Salesforce][5], [Microsoft Learn][10])
3. Save → Salesforce will display a **Callback URL**. **Copy** this callback and put it into Azure App Registration → **Authentication** → **+Add Platform** → **Web** → **Redirect URI** → `Callback URL`. ([Microsoft Learn][10])

**Tip:** If your Named Credential is per-user (user identity), use an OAuth flow that supports per-user consent (Browser / authorization code flow).

---

## E. Salesforce: External Credential(s)

**Purpose:** configure auth method that Named Credential will reuse. In Salesforce’s External Credentials you define how Salesforce obtains tokens.

**Navigation (Salesforce Setup → External Credentials):**

1. New External Credential → choose **OAuth 2.0** (Client Credentials or Authorization Code depending on your design). Fill parameters and associate the Auth Provider you created earlier. ([Salesforce][11])
2. **Principals (Authenticated Identities):** add and authenticate the principals you intend to use:

   * `https://graph.microsoft.com/.default`
   * `https://api.powerplatformapi.com/.default`
     These are typical resource identifiers when using client credentials or to request delegated scopes for Graph/Power Platform. The Microsoft account used during authentication will be used to invoke Copilot and access SharePoint resources. ([Microsoft Learn][9])

**Tip:** For per-user tokens use Authorization Code flow with refresh (`offline_access`) so Salesforce can persist user tokens.

---

## F. Salesforce: Named Credential

**Purpose:** single declarative endpoint with authentication plumbing — Apex uses the Named Credential and Salesforce injects the token automatically.

**Navigation (Salesforce Setup → Named Credentials):**

1. Setup → **Named Credentials** → **New Named Credential**.
2. **URL** = your Express.js server base URL (e.g., `https://express-bridge.example.com/`).
3. **Identity Type** = *Per User* (if you want Salesforce to use the calling user’s Microsoft identity) or *Named Principal* (shared account) depending on requirements.
4. **Authentication Protocol** = OAuth 2.0 → connect using the External Credential you created. Save. ([Salesforce][12], [UnofficialSF][13])

**Note:** When Apex calls the Named Credential endpoint, Salesforce will inject an `Authorization: Bearer <token>` header (no need to add it manually in code). ([Salesforce Developers][6])

---

## G. Apex (Agent Action)

**Purpose:** allow Salesforce Agentforce (or any flow/process) to invoke a server-side integration via Apex.

**Key requirements:**

* Annotate the Apex method with `@InvocableMethod` so it can be used as an Agent Action (or Flow/Process). The method must be `static` and accept a supported input type. ([Salesforce Developers][14])
* Call the **Named Credential** endpoint; **do not** hardcode tokens — reference the Named Credential URL (Salesforce will inject the token).

**Apex Code:**

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

## H. Express.js bridge (Microsoft Agents SDK)

**Purpose:** receive requests from Salesforce (with user token), and invoke Copilot Studio Agent via Microsoft Agents SDK / Copilot client.

---

## I. Remote site settings, Redirect URIs & consent

* **Salesforce Remote Site Settings**: add the Express server’s base URL to **Remote Site Settings** if your org uses older callout enforcement (or if your org still requires explicit allowlisting). This ensures Apex callouts are allowed. ([Salesforce][15])
* **App Registration Redirect URIs**: paste the **Salesforce callback URL** (copied from the Auth Provider setup) and the **Express Server URL** into **Azure App Registration → Authentication → Redirect URIs**. The redirect URI must match exactly. ([Microsoft Learn][10])
* **Admin consent**: after adding delegated permissions, use *Grant admin consent* in the Azure portal, or have each user consent on first sign-in. Some permissions like `Sites.Read.All` require admin consent. ([Microsoft Learn][1])

---

# Security & RBAC notes

* **Delegated permissions**: when you add Graph delegated permissions (e.g., `Sites.Read.All`), the app can act *only* on data the signed-in user can access — Microsoft Graph enforces per-user RBAC. This is why forwarding the user token is important for enforcing tenant RBAC. Do not use application permissions unless necessary. ([Microsoft Learn][1])
* **Least privilege**: request the minimal Graph/SharePoint scopes required; prefer site-specific resource access where possible instead of tenant-wide `*.All` scopes. ([Microsoft Learn][16])
* **Token lifecycle**: if using Authorization Code + refresh (`offline_access`), implement safe refresh handling on Salesforce or the bridge. If you must use client credentials (app identity) for background jobs, ensure long-term secrets are stored securely (Key Vault / protected secrets). ([Microsoft Learn][9])

---

# Troubleshooting checklist & common errors

* **`accessDenied` / 401 when granting PnP/Azure permission** → check that an **admin** granted consent for the delegated permissions and that the app registration has the required Copilot/Graph permission. Confirm tenant admin consent. ([Microsoft Learn][1], [npm][3])
* **Salesforce callout fails** → ensure Named Credential configured correctly, Remote Site Settings updated, and Apex endpoint uses `callout:<Named_Credential>` syntax. Check debug logs for `Authorization` header presence. ([Salesforce Developers][6], [Salesforce][15])
* **Copilot invocation permission error** → verify `CopilotStudio.Copilots.Invoke` (or equivalent Copilot permission) is present and admin-consented in app registration. ([npm][3])

---

# References & useful links

* Microsoft: *Integrate web or native apps with Copilot Studio using the Microsoft 365 Agents SDK*. ([Microsoft Learn][2])
* Microsoft: *Register an application in Microsoft Entra ID (App registrations)*. ([Microsoft Learn][8])
* Microsoft Graph: *Permissions reference & overview (delegated vs app)*. ([Microsoft Learn][16])
* Microsoft: *CopilotStudioAgent / Semantic Kernel integration notes*. ([Microsoft Learn][17])
* npm / package notes: `@microsoft/agents-copilotstudio-client` (notes about `CopilotStudio.Copilots.Invoke`). ([npm][3])
* Salesforce: *Create Named Credentials & External Credentials (how-to)*. ([Salesforce][18])
* Salesforce: *Apex callouts with Named Credentials (developer guide)*. ([Salesforce Developers][6])
* Salesforce: *Configure Auth Provider for Microsoft* (setup guidance). ([Salesforce][5])
* Salesforce: *Remote Site Settings (add API endpoint)*. ([Salesforce][15])

---


[1]: https://learn.microsoft.com/en-us/entra/identity-platform/permissions-consent-overview?utm_source=chatgpt.com "Overview of permissions and consent in the ..."
[2]: https://learn.microsoft.com/en-us/microsoft-copilot-studio/publication-integrate-web-or-native-app-m365-agents-sdk?utm_source=chatgpt.com "Integrate with web or native apps using Microsoft 365 ..."
[3]: https://www.npmjs.com/package/%40microsoft/agents-copilotstudio-client?activeTab=readme&utm_source=chatgpt.com "microsoft/agents-copilotstudio-client"
[4]: https://learn.microsoft.com/en-us/entra/fundamentals/how-to-create-delete-users?utm_source=chatgpt.com "How to create or delete users in Microsoft Entra ID"
[5]: https://help.salesforce.com/s/articleView?id=ind.sf_contracts_configure_an_auth_provider_for_microsoft_app.htm&language=en_US&type=5&utm_source=chatgpt.com "Configure an Auth Provider for Microsoft App Manually"
[6]: https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_callouts_named_credentials.htm?utm_source=chatgpt.com "Named Credentials as Callout Endpoints"
[7]: https://www.salesforceben.com/how-to-set-up-persisting-oauth-tokens-in-salesforce/?utm_source=chatgpt.com "How to Set Up Persisting OAuth Tokens in Salesforce"
[8]: https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app?utm_source=chatgpt.com "Register an application in Microsoft Entra ID"
[9]: https://learn.microsoft.com/en-us/power-platform/admin/programmability-authentication-v2?utm_source=chatgpt.com "Authentication - Power Platform"
[10]: https://learn.microsoft.com/en-us/entra/identity-platform/reply-url?utm_source=chatgpt.com "Redirect URI (reply URL) best practices and limitations"
[11]: https://help.salesforce.com/s/articleView?id=xcloud.nc_create_edit_oath_ext_cred.htm&language=en_US&type=5&utm_source=chatgpt.com "Create or Edit an OAuth External Credential"
[12]: https://help.salesforce.com/s/articleView?id=xcloud.named_credentials_about.htm&language=en_US&type=5&utm_source=chatgpt.com "Named Credentials"
[13]: https://unofficialsf.com/understanding-named-credentials/?utm_source=chatgpt.com "Understanding Named Credentials"
[14]: https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_annotation_InvocableMethod.htm?utm_source=chatgpt.com "InvocableMethod Annotation | Apex Developer Guide"
[15]: https://help.salesforce.com/s/articleView?id=ind.comms_t_add_api_endpoint_to_remote_site_settings_64690.htm&language=en_US&type=5&utm_source=chatgpt.com "Add API Endpoint to Remote Site Settings"
[16]: https://learn.microsoft.com/en-us/graph/permissions-reference?utm_source=chatgpt.com "Microsoft Graph permissions reference"
[17]: https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-types/copilot-studio-agent?utm_source=chatgpt.com "Exploring the Semantic Kernel Copilot Studio Agent"
[18]: https://help.salesforce.com/s/articleView?id=xcloud.nc_named_creds_and_ext_creds.htm&language=en_US&type=5&utm_source=chatgpt.com "Create Named Credentials and External Credentials"
