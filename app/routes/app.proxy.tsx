import { ActionFunction, LoaderFunction, json } from "@remix-run/node";
import { authenticate } from "app/shopify.server";
import { Page } from "@shopify/polaris";

export const dynamic = "force-dynamic";

export const loader: LoaderFunction = async ({ request }) => {
  console.log("--------hit app proxy loader--------");

  const session = await authenticate.public.appProxy(request);
  if (!session) {
    console.log("No session available in app proxy");
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch orders from the Shopify API
    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(
      `#graphql
      query {
        orders(first: 10) {
          edges {
            node {
              id
              name
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                firstName
                lastName
                email
              }
              createdAt
              displayFulfillmentStatus
            }
          }
        }
      }`,
    );

    const responseJson = await response.json();
    console.log("Orders fetched:", JSON.stringify(responseJson, null, 2));

    return json({
      success: true,
      orders: responseJson.data.orders,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch orders",
      },
      { status: 500 },
    );
  }
};

export const action: ActionFunction = async ({ request }) => {
  console.log("--------hit app proxy action--------");

  const session = await authenticate.public.appProxy(request);
  if (!session) {
    console.log("No session available in app proxy action");
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // Handle POST/PUT/DELETE requests here
  try {
    const data = await request.json();
    console.log("Received data:", data);

    // Depending on what you want to do with POST requests
    // This is just a placeholder for now
    return json({ success: true, message: "Action processed" });
  } catch (error) {
    console.error("Error in app proxy action:", error);
    return json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to process action",
      },
      { status: 500 },
    );
  }
};
