import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import crypto from "crypto";

export async function action({ request }: ActionFunctionArgs) {
  console.log("GDPR webhook received:", request.method);

  // 1. Clone the request since authenticate.webhook() will consume the body
  const reqClone = request.clone();
  const rawBody = await reqClone.text();

  // 2. Validate HMAC
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  if (!hmac) {
    console.error("Missing HMAC signature");
    return json({ message: "Missing signature" }, { status: 401 });
  }

  const generatedHash = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET || "")
    .update(rawBody, "utf8")
    .digest("base64");

  if (hmac !== generatedHash) {
    console.error("Invalid HMAC signature");
    return json({ message: "Invalid signature" }, { status: 401 });
  }

  try {
    // 3. Now proceed with Shopify authentication and webhook handling
    const { topic, shop, payload } = await authenticate.webhook(request);
    console.log("Webhook authenticated successfully");
    console.log("Topic:", topic);
    console.log("Shop:", shop);
    console.log("Payload:", payload);

    // Handle the webhook topic
    switch (topic) {
      case "customers/data_request":
        console.log(`Processing GDPR data request from ${shop}`);
        // TODO: Implement data request handling
        // 1. Gather all customer data
        // 2. Format it according to requirements
        // 3. Make it available for download
        break;
      case "customers/redact":
        console.log(`Processing customer data erasure request from ${shop}`);
        // TODO: Implement customer data redaction
        // 1. Find all data associated with the customer
        // 2. Permanently delete or anonymize it
        break;
      case "shop/redact":
        console.log(`Processing shop data erasure request from ${shop}`);
        // TODO: Implement shop data removal
        // 1. Find all data associated with the shop
        // 2. Permanently delete it
        break;
      default:
        console.log(`Unknown webhook topic: ${topic}, shop: ${shop}`);
        break;
    }

    // Always respond quickly with a 200 to let Shopify know you received it
    return json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return json({ error: "Webhook processing failed" }, { status: 401 });
  }
}
