import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export async function loader({ request }) {
  // Get the access key from the session
  const { admin } = await authenticate.admin(request);

  // Get the access key from metafields
  const metafieldResponse = await admin.graphql(`
    query {
      shop {
        metafield(namespace: "voicero", key: "access_key") {
          value
        }
      }
    }
  `);

  const metafieldData = await metafieldResponse.json();
  const accessKey = metafieldData.data.shop.metafield?.value;

  if (!accessKey) {
    return json({ error: "Access key not found" }, { status: 401 });
  }

  try {
    // Get website data to obtain the websiteId
    const websiteResponse = await fetch(`${urls.voiceroApi}/api/connect`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    });

    if (!websiteResponse.ok) {
      return json(
        { error: "Failed to fetch website data" },
        { status: websiteResponse.status },
      );
    }

    const websiteData = await websiteResponse.json();
    const websiteId = websiteData.website?.id;

    if (!websiteId) {
      return json({ error: "Website ID not found" }, { status: 404 });
    }

    // Fetch contacts data from the Voicero API with websiteId in the body
    const response = await fetch(`${urls.voiceroApi}/api/contacts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
      body: JSON.stringify({ websiteId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return json(
        { error: errorData.error || "Failed to fetch contacts" },
        { status: response.status },
      );
    }

    const contacts = await response.json();
    return json({ contacts, websiteId });
  } catch (error) {
    console.error("Error fetching contacts:", error);
    return json(
      { error: error.message || "Failed to fetch contacts" },
      { status: 500 },
    );
  }
}

export async function action({ request }) {
  // Get the access key from the session
  const { admin } = await authenticate.admin(request);

  // Get the access key from metafields
  const metafieldResponse = await admin.graphql(`
    query {
      shop {
        metafield(namespace: "voicero", key: "access_key") {
          value
        }
      }
    }
  `);

  const metafieldData = await metafieldResponse.json();
  const accessKey = metafieldData.data.shop.metafield?.value;

  if (!accessKey) {
    return json({ error: "Access key not found" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const action = formData.get("action");
    const contactId = formData.get("contactId");
    const websiteId = formData.get("websiteId");

    if (!websiteId) {
      return json({ error: "Website ID is required" }, { status: 400 });
    }

    // All actions go through the same /api/contacts endpoint
    const payload = {
      websiteId,
      contactId,
      action,
    };

    // Add action-specific fields
    if (action === "markAsRead") {
      payload.read = true;
    } else if (action === "sendReply") {
      payload.email = formData.get("email");
      payload.message = formData.get("message");
    }

    const response = await fetch(`${urls.voiceroApi}/api/contacts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return json(
        { error: errorData.error || "Failed to process request" },
        { status: response.status },
      );
    }

    const data = await response.json();
    return json({
      success: true,
      data,
      message:
        action === "sendReply"
          ? "Reply sent successfully"
          : "Contact marked as read",
    });
  } catch (error) {
    console.error("Error processing contacts action:", error);
    return json(
      { error: error.message || "Failed to process action" },
      { status: 500 },
    );
  }
}
