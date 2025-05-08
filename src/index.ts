#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { VERSION } from './version.js';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

//////////////////////////////////////////////////////////////////////////////
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
//////////////////////////////////////////////////////////////////////////////


import { tool_handler, list_of_tools } from './tool-handler.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AsanaClientWrapper } from './asana-client-wrapper.js'
import { createPromptHandlers } from './prompt-handler.js';
import { createResourceHandlers } from './resource-handler.js';

async function main() {
  // const asanaToken = process.env.ASANA_ACCESS_TOKEN;
  const asanaToken = process.env.ASANA_ACCESS_TOKEN;

  if (!asanaToken) {
    console.error("Please set ASANA_ACCESS_TOKEN environment variable");
    process.exit(1);
  }

  console.error("Starting Asana MCP Server...");
  const server = new Server(
    {
      name: "Asana MCP Server",
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {}
      },
    }
  );

  const asanaClient = new AsanaClientWrapper(asanaToken);

  server.setRequestHandler(
    CallToolRequestSchema,
    tool_handler(asanaClient)
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error("Received ListToolsRequest");
    return {
      tools: list_of_tools,
    };
  });

  const promptHandlers = createPromptHandlers(asanaClient);

  // Add prompt handlers
  server.setRequestHandler(ListPromptsRequestSchema, promptHandlers.listPrompts);
  server.setRequestHandler(GetPromptRequestSchema, promptHandlers.getPrompt);

  // Add resource handlers
  const resourceHandlers = createResourceHandlers(asanaClient);
  server.setRequestHandler(ListResourcesRequestSchema, resourceHandlers.listResources);
  server.setRequestHandler(ListResourceTemplatesRequestSchema, resourceHandlers.listResourceTemplates);
  server.setRequestHandler(ReadResourceRequestSchema, resourceHandlers.readResource);


  const app = express();
  app.use(express.json());

 
  const transports: Record<string, SSEServerTransport> = {};

  app.get('/mcp', async (req: Request, res: Response) => {
    console.log('Received GET request to /sse (establishing SSE stream)');
  
    try {
      const transport = new SSEServerTransport('/messages', res);
  
      const sessionId = transport.sessionId;
      transports[sessionId] = transport;
  
      transport.onclose = () => {
        console.log(`SSE transport closed for session ${sessionId}`);
        delete transports[sessionId];
      };
  
      await server.connect(transport);
  
      console.log(`Established SSE stream with session ID: ${sessionId}`);
    } catch (error) {
      console.error('Error establishing SSE stream:', error);
      if (!res.headersSent) {
        res.status(500).send('Error establishing SSE stream');
      }
    }
  });
  
  app.post('/messages', async (req: Request, res: Response) => {
    console.log('Received POST request to /messages');
  

    const sessionId = req.query.sessionId as string | undefined;
  
    if (!sessionId) {
      console.error('No session ID provided in request URL');
      res.status(400).send('Missing sessionId parameter');
      return;
    }
  
    const transport = transports[sessionId];
    if (!transport) {
      console.error(`No active transport found for session ID: ${sessionId}`);
      res.status(404).send('Session not found');
      return;
    }
  
    try {
      await transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      console.error('Error handling request:', error);
      if (!res.headersSent) {
        res.status(500).send('Error handling request');
      }
    }
  });
  
  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`Simple SSE Server (deprecated protocol version 2024-11-05) listening on port ${PORT}`);
  });
  
  process.on('SIGINT', async () => {
    console.log('Shutting down server...');
  
    for (const sessionId in transports) {
      try {
        console.log(`Closing transport for session ${sessionId}`);
        await transports[sessionId].close();
        delete transports[sessionId];
      } catch (error) {
        console.error(`Error closing transport for session ${sessionId}:`, error);
      }
    }
    console.log('Server shutdown complete');
    process.exit(0);
  });

  
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
