import "@shopify/shopify-app-remix/adapters/node";
import {
  shopifyApp,
  LATEST_API_VERSION,
  ApiVersion,
  AppDistribution,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey:       process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion:   LATEST_API_VERSION,                // ← use the latest
  scopes:       process.env.SCOPES?.split(",") || [],
  appUrl:       process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution:   AppDistribution.Custom,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
// (You can drop the old `export const apiVersion = ApiVersion.January25;` entirely––the LATEST_API_VERSION is now in effect.)

export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate                = shopify.authenticate;
export const unauthenticated             = shopify.unauthenticated;
export const login                       = shopify.login;
export const registerWebhooks            = shopify.registerWebhooks;
export const sessionStorage              = shopify.sessionStorage;
