import { useState, useEffect, useCallback } from "react";
import { useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Text,
  TextField,
  Banner,
  Link,
  InlineStack,
  Icon,
  Box,
  Divider,
  Spinner,
} from "@shopify/polaris";
import {
  KeyIcon,
  GlobeIcon,
  PageIcon,
  BlogIcon,
  ProductIcon,
  DiscountIcon,
  ChatIcon,
  RefreshIcon,
  SettingsIcon,
  ExternalIcon,
  ToggleOnIcon,
  ToggleOffIcon,
  QuestionCircleIcon,
  InfoIcon,
  CalendarIcon,
  DataPresentationIcon,
  CheckIcon,
  CollectionIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export const loader = async ({ request }) => {
  console.log("=== LOADER START: Initializing app loader ===");
  const { admin } = await authenticate.admin(request);
  console.log("Admin authentication completed");

  // Get subscription status
  console.log("Fetching subscription status...");
  const response = await admin.graphql(`
    query {
      appInstallation {
        activeSubscriptions {
          id
          name
          status
          lineItems {
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      }
    }
  `);

  const data = await response.json();
  console.log("Subscription data received:", data);
  const subscriptions = data.data.appInstallation.activeSubscriptions;
  const isPro = subscriptions.some(
    (sub) =>
      sub.status === "ACTIVE" &&
      sub.lineItems[0]?.plan?.pricingDetails?.price?.amount > 0,
  );
  console.log("Pro status determined:", isPro);

  // Get access key from metafields
  console.log("Fetching access key from metafields...");
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
  console.log("Metafield data received:", metafieldData);
  const savedKey = metafieldData.data.shop.metafield?.value;
  console.log("Saved key retrieved:", savedKey ? "Found key" : "No key found");

  let isConnected = false;
  if (savedKey) {
    console.log("Testing connection with saved key...");
    try {
      const trimmedKey = savedKey.trim();
      console.log("Using trimmed key for connection test");
      console.log("Key length:", trimmedKey.length);

      // Try both localhost and production URLs
      const apiUrls = [
        `${urls.voiceroApi}/api/connect`, // Development
        `${urls.voiceroApi}/api/connect`, // Production backup
      ];

      let connected = false;
      let responseData = null;

      // Try each URL in sequence
      for (const apiUrl of apiUrls) {
        console.log(`Attempting API connection test with URL: ${apiUrl}`);
        try {
          const testResponse = await fetch(apiUrl, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${trimmedKey}`,
            },
            mode: "cors",
          });
          console.log(
            `Connection test response status for ${apiUrl}:`,
            testResponse.status,
          );

          const responseText = await testResponse.text();
          console.log(
            `Connection test raw response for ${apiUrl}:`,
            responseText,
          );

          try {
            const parsedData = JSON.parse(responseText);
            console.log(
              `Connection test parsed data for ${apiUrl}:`,
              parsedData,
            );

            // Only set isConnected to true if we have valid website data
            if (testResponse.ok && parsedData.website) {
              console.log(`Connection successful with ${apiUrl}`);
              connected = true;
              responseData = parsedData;
              // Break loop on first successful connection
              break;
            }
          } catch (e) {
            console.error(
              `Error parsing connection test response from ${apiUrl}:`,
              e,
            );
          }
        } catch (fetchError) {
          console.error(`Fetch error for ${apiUrl}:`, fetchError);
          // Continue to next URL if this one fails
        }
      }

      isConnected = connected;
      console.log("Final connection status determined:", isConnected);
    } catch (error) {
      console.error("Error testing connection:", error);
      isConnected = false;
    }
  }

  console.log("=== LOADER END: Returning data ===");
  console.log({
    isPro,
    apiKey: process.env.SHOPIFY_API_KEY || "(not set)",
    savedKey: isConnected ? "Valid key exists" : null,
  });

  return json({
    isPro,
    apiKey: process.env.SHOPIFY_API_KEY || "",
    savedKey: isConnected ? savedKey : null,
  });
};

// Add helper function before the action handler
async function getShopId(admin) {
  try {
    const shopResponse = await admin.graphql(`
      query {
        shop {
          id
        }
      }
    `);
    const shopData = await shopResponse.json();
    return shopData.data.shop.id;
  } catch (error) {
    console.error("Error fetching shop ID:", error);
    throw error;
  }
}

export const action = async ({ request }) => {
  console.log("=== ACTION START: Processing action request ===");
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const accessKey = formData.get("accessKey");
  const action = formData.get("action");
  console.log("Action type:", action);
  console.log("Access key provided:", accessKey ? "Yes (value hidden)" : "No");

  try {
    if (action === "quick_connect") {
      console.log("Processing quick_connect action");
      const shop = session.shop;
      const storeName = shop.split(".")[0];
      const appHandle = process.env.SHOPIFY_APP_HANDLE || "voicero-app-shop";
      const site_url = encodeURIComponent(`https://${shop}`);
      const admin_url = encodeURIComponent(
        `https://admin.shopify.com/store/${storeName}/apps/${appHandle}/app`,
      );

      // Get and include callback URL for when the quick connect completes
      // This allows us to handle the returned key properly
      const callbackUrl = encodeURIComponent(
        `${
          request.headers.get("referer") ||
          `https://${session.shop}/admin/apps/${appHandle}`
        }/api/quickConnectCallback`,
      );

      console.log("Redirect URL parameters prepared:", {
        shop,
        storeName,
        appHandle,
        site_url: `https://${shop}`,
        admin_url: `https://admin.shopify.com/store/${storeName}/apps/${appHandle}/app`,
        callback_url: callbackUrl,
      });

      console.log("=== ACTION END: Returning redirect URL ===");
      return {
        success: true,
        redirectUrl: `${urls.voiceroApi}/app/connect?site_url=${site_url}&redirect_url=${admin_url}&callback_url=${callbackUrl}&type=Shopify`,
      };
    } else if (action === "quick_connect_callback") {
      // This is called when the quick connect flow completes
      console.log("Processing quick_connect_callback action");
      try {
        const incomingKey = formData.get("access_key");
        if (!incomingKey) {
          console.error("No access key provided in callback");
          throw new Error(
            "No access key was provided from the quick connect flow",
          );
        }

        console.log("Received new access key from quick connect flow");

        // First, check if there's an existing key we need to delete
        console.log("Checking for existing access key");
        const metafieldResponse = await admin.graphql(`
          query {
            shop {
              metafield(namespace: "voicero", key: "access_key") {
                id
                value
              }
            }
          }
        `);

        const metafieldData = await metafieldResponse.json();
        console.log("Existing key check response:", metafieldData);

        // If there's an existing metafield with a key, delete it first
        if (metafieldData.data?.shop?.metafield?.id) {
          console.log("Found existing key, deleting it first");
          const metafieldId = metafieldData.data.shop.metafield.id;

          const deleteResponse = await admin.graphql(`
            mutation {
              metafieldDelete(input: {
                id: "${metafieldId}"
              }) {
                deletedId
                userErrors {
                  field
                  message
                }
              }
            }
          `);

          const deleteResult = await deleteResponse.json();
          console.log("Delete key response:", deleteResult);

          if (deleteResult.data?.metafieldDelete?.userErrors?.length > 0) {
            console.warn(
              "Warning: Issues deleting old key:",
              deleteResult.data.metafieldDelete.userErrors,
            );
          }
        }

        // Now save the new key
        const shopId = await getShopId(admin);

        console.log("Creating metafield to store access key...");
        const saveResponse = await admin.graphql(
          `
          mutation CreateMetafield($input: MetafieldsSetInput!) {
            metafieldsSet(metafields: [$input]) {
              metafields {
                id
                key
                value
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          {
            variables: {
              input: {
                namespace: "voicero",
                key: "access_key",
                type: "single_line_text_field",
                value: incomingKey,
                ownerId: shopId,
              },
            },
          },
        );

        const saveResult = await saveResponse.json();
        console.log("Save key response:", saveResult);

        if (saveResult.data?.metafieldsSet?.userErrors?.length > 0) {
          console.error(
            "Save key errors:",
            saveResult.data.metafieldsSet.userErrors,
          );
          throw new Error("Failed to save access key from quick connect flow");
        }

        // Now try to connect with the key
        return {
          success: true,
          message: "Successfully saved access key from quick connect flow",
          accessKey: incomingKey,
          shouldConnect: true,
        };
      } catch (error) {
        console.error("Quick connect callback error:", error);
        return {
          success: false,
          error: error.message,
        };
      }
    } else if (action === "manual_connect") {
      console.log("Processing manual_connect action");
      try {
        const trimmedKey = accessKey?.trim();
        console.log("Trimmed key available:", !!trimmedKey);
        console.log("Key length:", trimmedKey?.length || 0);

        if (!trimmedKey) {
          console.error("No access key provided");
          throw new Error("No access key provided");
        }

        console.log("Attempting API connection with provided key...");
        const headers = new Headers();
        headers.append("Accept", "application/json");
        headers.append("Authorization", `Bearer ${trimmedKey}`);

        // Try various URLs for connection
        const apiUrls = [
          `${urls.voiceroApi}/api/connect`,
          `${urls.voiceroApi}/api/connect`,
        ];

        let connectionSuccessful = false;
        let connectionResponse = null;
        let connectionData = null;
        let connectionError = null;

        // Try each URL until one succeeds
        for (const apiUrl of apiUrls) {
          try {
            console.log(`Trying connection to: ${apiUrl}`);
            const response = await fetch(apiUrl, {
              method: "GET",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${trimmedKey}`,
              },
              mode: "cors",
            });
            console.log(
              `Connection API response status for ${apiUrl}:`,
              response.status,
            );

            const responseText = await response.text();
            console.log(
              `Connection API raw response for ${apiUrl}:`,
              responseText,
            );

            try {
              const data = JSON.parse(responseText);
              console.log(`Connection API parsed data for ${apiUrl}:`, data);

              if (response.ok && data.website) {
                connectionSuccessful = true;
                connectionResponse = response;
                connectionData = data;
                console.log(`Successful connection to ${apiUrl}`);
                break;
              } else {
                console.log(
                  `Connection to ${apiUrl} returned invalid data or error:`,
                  data,
                );
                connectionError = data.error || "Connection failed";
              }
            } catch (parseError) {
              console.error(
                `Error parsing response from ${apiUrl}:`,
                parseError,
              );
              connectionError = "Invalid response format";
            }
          } catch (fetchError) {
            console.error(`Fetch error for ${apiUrl}:`, fetchError);
            connectionError = fetchError.message;
          }
        }

        if (!connectionSuccessful) {
          console.error(
            "All connection attempts failed. Last error:",
            connectionError,
          );
          throw new Error(
            connectionError ||
              "Connection failed. Please check your access key.",
          );
        }

        // We have a successful connection at this point
        const data = connectionData;

        // Update theme settings directly using the admin API
        console.log("Fetching shop ID...");
        const shopResponse = await admin.graphql(`
          query {
            shop {
              id
            }
          }
        `);

        const shopData = await shopResponse.json();
        console.log("Shop data received:", shopData);
        const shopId = shopData.data.shop.id;
        console.log("Shop ID:", shopId);

        console.log("Creating metafield to store access key...");
        const metafieldResponse = await admin.graphql(
          `
          mutation CreateMetafield($input: MetafieldsSetInput!) {
            metafieldsSet(metafields: [$input]) {
              metafields {
                id
                key
                value
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          {
            variables: {
              input: {
                namespace: "voicero",
                key: "access_key",
                type: "single_line_text_field",
                value: accessKey,
                ownerId: shopId,
              },
            },
          },
        );

        const metafieldData = await metafieldResponse.json();
        console.log("Metafield creation response:", metafieldData);

        if (metafieldData.data?.metafieldsSet?.userErrors?.length > 0) {
          console.error(
            "Metafield errors:",
            metafieldData.data.metafieldsSet.userErrors,
          );
          throw new Error("Failed to save access key to store");
        }

        console.log("=== ACTION END: Manual connection successful ===");
        return {
          success: true,
          accessKey: accessKey,
          message: `Successfully connected to ${data.website?.name || "website"}!`,
          websiteData: data.website,
          namespace: data.website?.VectorDbConfig?.namespace || data.namespace,
        };
      } catch (error) {
        console.error("Manual connect error:", error);
        return {
          success: false,
          error: error.message,
        };
      }
    }
  } catch (error) {
    console.error("Action handler error:", error);
    let errorMessage = error.message;

    if (error.response) {
      try {
        const errorData = await error.response.json();
        console.error("Error response data:", errorData);
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        console.error("Failed to parse error response:", e);
        // If we can't parse the error response, stick with the original message
      }
    }

    console.log("=== ACTION END: Returning error ===");
    return {
      success: false,
      error: errorMessage,
    };
  }
};

// Add these helper functions
async function getActiveThemeId(admin) {
  const response = await admin.graphql(`
    query {
      themes(first: 10) {
        nodes {
          id
          role
          name
        }
      }
    }
  `);
  const data = await response.json();

  // Find the main theme
  const mainTheme = data.data.themes.nodes.find(
    (theme) => theme.role === "MAIN",
  );

  if (!mainTheme) {
    // If no MAIN theme, try to find a PUBLISHED theme
    const publishedTheme = data.data.themes.nodes.find(
      (theme) => theme.role === "PUBLISHED",
    );
    return publishedTheme?.id;
  }

  return mainTheme?.id;
}

async function updateThemeSettings(admin, themeId, accessKey) {
  if (!themeId) {
    return;
  }

  try {
    const themeIdNumber = themeId.split("/").pop();

    // Use standard REST API format
    const response = await admin.rest.get({
      path: `/themes/${themeIdNumber}/assets.json`,
    });

    let settingsData = {
      current: {
        "voicero-assistant": {
          access_key: accessKey,
        },
      },
    };

    try {
      // Get existing settings
      const settingsAsset = await admin.rest.get({
        path: `/themes/${themeIdNumber}/assets.json`,
        query: { "asset[key]": "config/settings_data.json" },
      });

      if (settingsAsset?.body?.asset?.value) {
        const currentSettings = JSON.parse(settingsAsset.body.asset.value);
        settingsData = {
          ...currentSettings,
          current: {
            ...currentSettings.current,
            "voicero-assistant": {
              access_key: accessKey,
            },
          },
        };
      }
    } catch (e) {
      // Handle error silently
    }

    // Update settings_data.json
    const updateResponse = await admin.rest.put({
      path: `/themes/${themeIdNumber}/assets.json`,
      data: {
        asset: {
          key: "config/settings_data.json",
          value: JSON.stringify(settingsData, null, 2),
        },
      },
    });

    if (updateResponse?.body?.asset) {
      // Successfully updated theme settings
    } else {
      throw new Error("Failed to update theme settings");
    }
  } catch (error) {
    // Handle error silently
  }
}

// Add new helper function for training individual content
const trainContentItem = async (accessKey, contentType, item) => {
  console.log(`Training ${contentType} item:`, item);

  const response = await fetch(
    `${urls.voiceroApi}/api/shopify/train/${contentType}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
      body: JSON.stringify({
        id: item.id,
        vectorId: item.vectorId,
        shopifyId: item.shopifyId,
      }),
    },
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `Training failed for ${contentType} ${item.shopifyId}: ${errorData.error || "Unknown error"}`,
    );
  }

  return response.json();
};

// Helper to calculate total items
const calculateTotalItems = (data) => {
  if (!data || !data.content) return 0;
  const counts = {
    products: data.content.products?.length || 0,
    pages: data.content.pages?.length || 0,
    posts: data.content.posts?.length || 0,
    collections: data.content.collections?.length || 0,
    discounts: data.content.discounts?.length || 0,
  };
  // Add 1 for general training step
  return Object.values(counts).reduce((a, b) => a + b, 0) + 1;
};

// Add helper function to get category count
const getCategoryCount = (data, category) => {
  if (!data?.content?.[category]) return 0;
  return data.content[category].length;
};

export default function Index() {
  const { savedKey } = useLoaderData();
  const navigate = useNavigate();

  // Check for access_key in URL
  useEffect(() => {
    console.log("Checking for access_key in URL");
    const url = new URL(window.location.href);
    const accessKeyParam = url.searchParams.get("access_key");

    if (accessKeyParam) {
      console.log("Found access_key in URL, will use for connection");

      // Clean up the URL by removing the access_key parameter
      url.searchParams.delete("access_key");
      window.history.replaceState({}, document.title, url.toString());

      // Set the access key from the URL param
      setAccessKey(accessKeyParam);
    }
  }, []);

  // State to track active training process
  const [trainingData, setTrainingData] = useState(null);
  // Get API key from saved key (from loader data)
  const apiKey = savedKey;

  // State for UI and data
  const [accessKey, setAccessKey] = useState(savedKey || "");
  const fetcher = useFetcher();
  const app = useAppBridge();
  const isLoading = fetcher.state === "submitting";
  const [error, setError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [namespace, setNamespace] = useState(null);

  // Handle successful connection response
  useEffect(() => {
    console.log("useEffect: handling fetcher.data response");
    if (fetcher.data?.success && fetcher.data.accessKey) {
      console.log("Successful connection, setting access key");
      setAccessKey(fetcher.data.accessKey);
    }

    // Check if we got a response with namespace data
    if (fetcher.data?.namespace) {
      console.log(
        "Setting namespace from direct namespace field:",
        fetcher.data.namespace,
      );
      setNamespace(fetcher.data.namespace);
    }
    // Check if we have namespace in VectorDbConfig
    else if (fetcher.data?.websiteData?.VectorDbConfig?.namespace) {
      const websiteNamespace =
        fetcher.data.websiteData.VectorDbConfig.namespace;
      console.log("Setting namespace from VectorDbConfig:", websiteNamespace);
      setNamespace(websiteNamespace);
    }

    // Log the complete website data in a clean format
    if (fetcher.data?.websiteData) {
      console.log("=== WEBSITE DATA ===");
      console.log(
        JSON.stringify(
          {
            id: fetcher.data.websiteData.id,
            name: fetcher.data.websiteData.name,
            url: fetcher.data.websiteData.url,
            type: fetcher.data.websiteData.type,
            plan: fetcher.data.websiteData.plan,
            active: fetcher.data.websiteData.active,
            lastSyncedAt: fetcher.data.websiteData.lastSyncedAt,
            queryLimit: fetcher.data.websiteData.queryLimit,
            monthlyQueries: fetcher.data.websiteData.monthlyQueries,
            contentCounts: fetcher.data.websiteData._count,
            VectorDbConfig: fetcher.data.websiteData.VectorDbConfig,
          },
          null,
          2,
        ),
      );
    }
  }, [fetcher.data]);

  // Auto-connect when we have an access key
  useEffect(() => {
    console.log("useEffect: accessKey changed, current value:", !!accessKey);
    console.log("fetcher.data?.success:", fetcher.data?.success);

    if (accessKey && !fetcher.data?.success) {
      // Only connect if we haven't already
      console.log("Auto-connecting with access key");
      setIsDataLoading(true);
      fetcher.submit(
        { accessKey, action: "manual_connect" },
        { method: "POST" },
      );
    }
  }, [accessKey]);

  // Reset data loading state when we get data back from fetcher
  useEffect(() => {
    console.log("useEffect: fetcher.data updated");
    if (fetcher.data) {
      console.log("Fetcher data received, resetting loading states");
      setIsDataLoading(false);
      setIsConnecting(false);
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (fetcher.data?.redirectUrl) {
      const newWindow = window.open("");
      if (newWindow) {
        newWindow.opener = null;
        newWindow.location = fetcher.data.redirectUrl;
      }
    }
  }, [fetcher.data]);

  const handleManualConnect = async () => {
    console.log("handleManualConnect called");
    if (!accessKey) {
      console.log("No access key provided, showing error");
      setError("Please enter an access key");
      return;
    }
    console.log("Proceeding with manual connect");
    setError("");
    setIsConnecting(true);

    try {
      // First, check if there's an existing key we need to delete
      console.log("Checking for existing access key");
      const existingKeyResponse = await fetch("/api/accessKey", {
        method: "GET",
      });
      const existingKeyData = await existingKeyResponse.json();
      console.log("Existing key check response:", existingKeyData);

      // If there's an existing key, delete it first
      if (existingKeyData.success && existingKeyData.accessKey) {
        console.log("Found existing key, deleting it first");
        const deleteResponse = await fetch("/api/accessKey", {
          method: "DELETE",
        });
        const deleteResult = await deleteResponse.json();
        console.log("Delete key response:", deleteResult);
      }

      // Now set the new key
      console.log("Setting new access key");
      const saveResponse = await fetch("/api/accessKey", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessKey: accessKey,
        }),
      });
      const saveResult = await saveResponse.json();
      console.log("Save key response:", saveResult);

      if (!saveResult.success) {
        throw new Error(`Failed to save access key: ${saveResult.message}`);
      }

      // Now connect with the new key
      console.log("Submitting manual_connect action with new access key");
      fetcher.submit(
        {
          accessKey,
          action: "manual_connect",
        },
        { method: "POST" },
      );
    } catch (error) {
      console.error("Error updating access key:", error);
      setError(`Failed to update access key: ${error.message}`);
      setIsConnecting(false);
    }
  };

  const handleQuickConnect = () => {
    console.log("handleQuickConnect called");
    console.log("Submitting quick_connect action");
    fetcher.submit({ action: "quick_connect" }, { method: "POST" });
  };

  const handleDisconnect = () => {
    try {
      // Reset all state
      setAccessKey("");
      setNamespace(null);
      setTrainingData(null);

      // Clear any in-memory data
      if (fetcher) {
        if (fetcher.data) fetcher.data = null;

        // Submit the disconnect action to the server
        fetcher.submit({ action: "disconnect" }, { method: "POST" });

        // Navigate to home page after sufficient delay to allow server to process
        setTimeout(() => {
          // Use absolute path to ensure we get a full page load
          window.location.href = "/app";
        }, 2000); // 2-second delay to allow server processing
      }
    } catch (error) {
      // Even if there's an error, try to reload
      window.location.href = "/app";
    }
  };

  const handleSync = async () => {
    console.log("=== SYNC START: Beginning content sync process ===");
    try {
      setIsSyncing(true);
      setError("");
      console.log("Setting UI state: isSyncing=true");

      // Step 1: Initial sync
      console.log("Step 1: Initiating local API sync");
      const syncInitResponse = await fetch("/api/sync", {
        method: "GET",
      });
      console.log("Initial sync response status:", syncInitResponse.status);

      const responseText = await syncInitResponse.text();
      console.log("Initial sync raw response:", responseText);
      let data;
      try {
        data = JSON.parse(responseText);
        console.log("Initial sync data parsed successfully");

        // Log the complete data in a clean format
        console.log("=== COMPLETE SYNC DATA ===");
        console.log(JSON.stringify(data, null, 2));

        // If there's an error, log it in a more readable format
        if (data.error) {
          console.log("=== SYNC ERROR ===");
          console.log(
            JSON.stringify(
              {
                error: data.error,
                details: data.details,
                graphQLErrors: data.graphQLErrors,
              },
              null,
              2,
            ),
          );
        }
      } catch (e) {
        console.error("Failed to parse JSON response:", e);
        throw new Error(`Invalid JSON response: ${responseText}`);
      }

      if (!syncInitResponse.ok) {
        console.error("Initial sync failed:", syncInitResponse.status);
        throw new Error(
          `HTTP error! status: ${syncInitResponse.status}, details: ${
            data.details || "unknown error"
          }${
            data.graphQLErrors
              ? `, GraphQL errors: ${JSON.stringify(data.graphQLErrors)}`
              : ""
          }`,
        );
      }
      console.log("Initial sync completed successfully");

      // Step 2: Send data to backend
      console.log("Step 2: Sending sync data to backend");
      console.log("Sync data size:", JSON.stringify(data).length, "bytes");
      const syncResponse = await fetch(`${urls.voiceroApi}/api/shopify/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessKey}`,
        },
        body: JSON.stringify({
          fullSync: true,
          data: data,
        }),
      });
      console.log("Backend sync response status:", syncResponse.status);

      if (!syncResponse.ok) {
        const errorData = await syncResponse.json();
        console.error("Backend sync error:", errorData);
        throw new Error(
          `Sync error! status: ${syncResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }
      console.log("Backend sync completed successfully");

      // Step 3: Start vectorization
      console.log("Step 3: Starting vectorization process");
      setLoadingText(
        "Vectorizing your store content... This may take a few minutes.",
      );

      const vectorizeResponse = await fetch(
        `${urls.voiceroApi}/api/shopify/vectorize`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
        },
      );
      console.log("Vectorization response status:", vectorizeResponse.status);

      if (!vectorizeResponse.ok) {
        const errorData = await vectorizeResponse.json();
        console.error("Vectorization error:", errorData);
        throw new Error(
          `Vectorization error! status: ${vectorizeResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }

      // Process the regular JSON response
      const vectorizeData = await vectorizeResponse.json();
      console.log("Vectorization response data:", vectorizeData);

      // Check if the vectorization was successful
      if (!vectorizeData.success) {
        console.error("Vectorization failed:", vectorizeData.error);
        throw new Error(
          `Vectorization failed: ${vectorizeData.error || "Unknown error"}`,
        );
      }

      // Show some stats if available
      if (vectorizeData.stats) {
        console.log("Vectorization stats:", vectorizeData.stats);
        setLoadingText(
          `Vectorization complete! Added ${vectorizeData.stats.added} items to the vector database.`,
        );
      } else {
        setLoadingText("Vectorization completed successfully!");
      }

      // Step 4: Create or get assistant
      console.log("Step 4: Setting up AI assistant");
      setLoadingText("Setting up your AI assistant...");
      const assistantResponse = await fetch(
        `${urls.voiceroApi}/api/shopify/assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
        },
      );
      console.log("Assistant setup response status:", assistantResponse.status);

      if (!assistantResponse.ok) {
        const errorData = await assistantResponse.json();
        console.error("Assistant setup error:", errorData);
        throw new Error(
          `Assistant setup error! status: ${assistantResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }

      const assistantData = await assistantResponse.json();
      console.log("Assistant response data:", assistantData);

      // Get website ID from the initial sync response
      const websiteId = data.website?.id;
      if (!websiteId) {
        throw new Error("No website ID found in sync response");
      }

      // After assistant setup, start individual training
      console.log("Starting individual content training");
      setIsTraining(true);
      setLoadingText("Starting content training process...");

      // Calculate total items to train
      const totalItems = calculateTotalItems(assistantData);
      let trainedItems = 0;

      // Initialize training state
      setTrainingData({
        status: "processing",
        progress: 0,
        message: "Preparing to train content...",
        steps: [],
        currentCategory: 0,
        categories: ["products", "pages", "posts", "collections", "discounts"],
      });

      // Train products
      if (assistantData.content.products?.length) {
        setTrainingData((prev) => ({
          ...prev,
          message: "Training products...",
          currentCategory: 0,
        }));

        const productCount = getCategoryCount(assistantData, "products");
        let trainedProducts = 0;

        for (const product of assistantData.content.products) {
          try {
            await trainContentItem(accessKey, "product", product);
            trainedItems++;
            trainedProducts++;
            const progress = Math.round((trainedItems / totalItems) * 100);
            setTrainingData((prev) => ({
              ...prev,
              progress,
              message: `Training products (${trainedProducts}/${productCount}) | Overall: ${trainedItems}/${totalItems}`,
            }));
          } catch (error) {
            console.error("Error training product:", error);
            // Continue with next item
          }
        }
      }

      // Train pages
      if (assistantData.content.pages?.length) {
        setTrainingData((prev) => ({
          ...prev,
          message: "Training pages...",
          currentCategory: 1,
        }));

        const pageCount = getCategoryCount(assistantData, "pages");
        let trainedPages = 0;

        for (const page of assistantData.content.pages) {
          try {
            await trainContentItem(accessKey, "page", page);
            trainedItems++;
            trainedPages++;
            const progress = Math.round((trainedItems / totalItems) * 100);
            setTrainingData((prev) => ({
              ...prev,
              progress,
              message: `Training pages (${trainedPages}/${pageCount}) | Overall: ${trainedItems}/${totalItems}`,
            }));
          } catch (error) {
            console.error("Error training page:", error);
            // Continue with next item
          }
        }
      }

      // Train posts
      if (assistantData.content.posts?.length) {
        setTrainingData((prev) => ({
          ...prev,
          message: "Training posts...",
          currentCategory: 2,
        }));

        const postCount = getCategoryCount(assistantData, "posts");
        let trainedPosts = 0;

        for (const post of assistantData.content.posts) {
          try {
            await trainContentItem(accessKey, "post", post);
            trainedItems++;
            trainedPosts++;
            const progress = Math.round((trainedItems / totalItems) * 100);
            setTrainingData((prev) => ({
              ...prev,
              progress,
              message: `Training posts (${trainedPosts}/${postCount}) | Overall: ${trainedItems}/${totalItems}`,
            }));
          } catch (error) {
            console.error("Error training post:", error);
            // Continue with next item
          }
        }
      }

      // Train collections
      if (assistantData.content.collections?.length) {
        setTrainingData((prev) => ({
          ...prev,
          message: "Training collections...",
          currentCategory: 3,
        }));

        const collectionCount = getCategoryCount(assistantData, "collections");
        let trainedCollections = 0;

        for (const collection of assistantData.content.collections) {
          try {
            await trainContentItem(accessKey, "collection", collection);
            trainedItems++;
            trainedCollections++;
            const progress = Math.round((trainedItems / totalItems) * 100);
            setTrainingData((prev) => ({
              ...prev,
              progress,
              message: `Training collections (${trainedCollections}/${collectionCount}) | Overall: ${trainedItems}/${totalItems}`,
            }));
          } catch (error) {
            console.error("Error training collection:", error);
            // Continue with next item
          }
        }
      }

      // Train discounts
      if (assistantData.content.discounts?.length) {
        setTrainingData((prev) => ({
          ...prev,
          message: "Training discounts...",
          currentCategory: 4,
        }));

        const discountCount = getCategoryCount(assistantData, "discounts");
        let trainedDiscounts = 0;

        for (const discount of assistantData.content.discounts) {
          try {
            await trainContentItem(accessKey, "discount", discount);
            trainedItems++;
            trainedDiscounts++;
            const progress = Math.round((trainedItems / totalItems) * 100);
            setTrainingData((prev) => ({
              ...prev,
              progress,
              message: `Training discounts (${trainedDiscounts}/${discountCount}) | Overall: ${trainedItems}/${totalItems}`,
            }));
          } catch (error) {
            console.error("Error training discount:", error);
            // Continue with next item
          }
        }
      }

      // Training complete
      setTrainingData((prev) => ({
        ...prev,
        status: "success",
        progress: 100,
        message: "Training complete! Your AI assistant is ready to use.",
        currentCategory: 5,
      }));

      // Step 5: Train general QAs
      console.log("Step 5: Training general QAs");
      setLoadingText("Training general QAs...");
      setTrainingData((prev) => ({
        ...prev,
        status: "processing",
        message: "Training general QAs...",
        currentCategory: 5,
      }));

      const generalTrainingResponse = await fetch(
        `${urls.voiceroApi}/api/shopify/train/general`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
          body: JSON.stringify({
            websiteId: websiteId,
          }),
        },
      );

      if (!generalTrainingResponse.ok) {
        const errorData = await generalTrainingResponse.json();
        console.error("General training error:", errorData);
        throw new Error(
          `General training error! status: ${generalTrainingResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }

      const generalTrainingData = await generalTrainingResponse.json();
      console.log("General training response data:", generalTrainingData);

      // Update training data to show completion
      setTrainingData((prev) => ({
        ...prev,
        status: "success",
        progress: 100,
        message: "Training complete! Your AI assistant is ready to use.",
        currentCategory: 6,
      }));

      setLoadingText("Training complete! Your AI assistant is ready to use.");
      setIsSuccess(true);
      setIsSyncing(false);
      console.log("=== SYNC END: All processes completed successfully ===");
    } catch (error) {
      console.error("Sync process failed:", error);
      setError(
        <Banner status="critical" onDismiss={() => setError("")}>
          <p>Failed to sync content: {error.message}</p>
        </Banner>,
      );
      setIsSyncing(false);
      console.log("=== SYNC END: Process failed with error ===");
    }
  };

  // Helper to get training progress
  const getTrainingProgress = useCallback(() => {
    if (!trainingData) return 0;

    // Use progress directly if available
    if (trainingData.progress) {
      const progressValue = parseInt(trainingData.progress);
      if (!isNaN(progressValue)) {
        return progressValue;
      }
    }

    // Fall back to category calculation if available
    const { currentCategory, categories } = trainingData;
    if (currentCategory === undefined || !categories || !categories.length)
      return 0;

    return Math.round((currentCategory / categories.length) * 100);
  }, [trainingData]);

  // Helper to get formatted training status message
  const getTrainingStatusMessage = useCallback(() => {
    if (!trainingData) return "No training data available";

    // If there's a message, use it
    if (trainingData.message) {
      return trainingData.message;
    }

    const { status, steps, currentCategory, categories } = trainingData;

    if (
      status === "complete" ||
      status === "done" ||
      status === "success" ||
      status === "finished"
    ) {
      return "Training process complete! Your AI assistant is ready.";
    }

    if (!steps || !steps.length) return "Training in progress...";

    // Get the latest step message
    const latestStep = steps[steps.length - 1];

    // Format a more descriptive message
    let progressMessage = latestStep.message;

    // Add category progress if available
    if (currentCategory !== undefined && categories && categories.length) {
      progressMessage += ` (${currentCategory + 1}/${categories.length} categories)`;
    }

    return progressMessage;
  }, [trainingData]);

  const handleViewStatus = async () => {
    console.log("handleViewStatus called");
    try {
      setIsDataLoading(true);
      setError("");
      console.log("Setting UI state: isDataLoading=true");

      // Check if we have the namespace
      console.log("Current namespace:", namespace);
      if (!namespace) {
        console.log("No namespace found, showing error");
        setError("No namespace found. Please connect to your website first.");
        setIsDataLoading(false);
        return;
      }

      // Show current data in a banner if we have it
      if (trainingData) {
        console.log("Displaying current training data in banner");
        // Display status in a banner
        setError(
          <Banner status="info" onDismiss={() => setError("")}>
            <p>Assistant Status:</p>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(trainingData, null, 2)}
            </pre>
          </Banner>,
        );
      } else {
        console.log("No training data yet, showing checking status message");
        setError(
          <Banner status="info" onDismiss={() => setError("")}>
            <p>Checking status... Results will appear in 1-2 seconds.</p>
          </Banner>,
        );
      }
    } catch (error) {
      console.error("Error checking status:", error);
      setError(`Error checking status: ${error.message}`);
    } finally {
      console.log("Setting isDataLoading=false");
      setIsDataLoading(false);
    }
  };

  return (
    <Page>
      <BlockStack gap="800">
        {/* Training Status Banner - Show only if we have training data AND it's not in "not_running" state */}
        {trainingData &&
          (trainingData.status === "processing" ||
            trainingData.status === "success") && (
            <Banner
              status={trainingData.status === "processing" ? "info" : "success"}
            >
              <BlockStack gap="300">
                <InlineStack align="center" gap="200">
                  {trainingData.status === "processing" && (
                    <Spinner size="small" />
                  )}
                  {trainingData.status !== "processing" && (
                    <Icon source={CheckIcon} color="success" />
                  )}
                  <Text variant="headingMd">
                    AI Assistant Training{" "}
                    {trainingData.status === "processing"
                      ? "in Progress"
                      : "Complete"}
                  </Text>
                </InlineStack>

                {trainingData.status === "processing" && (
                  <>
                    <Text>{getTrainingStatusMessage()}</Text>

                    {/* Progress bar */}
                    <div style={{ width: "100%", marginTop: "8px" }}>
                      <div
                        style={{
                          width: "100%",
                          background: "#e0e0e0",
                          borderRadius: "4px",
                          height: "8px",
                        }}
                      >
                        <div
                          style={{
                            width: `${getTrainingProgress()}%`,
                            background: "#008060",
                            borderRadius: "4px",
                            height: "8px",
                            transition: "width 0.5s ease-in-out",
                          }}
                        />
                      </div>
                      <Text variant="bodySm" alignment="end">
                        {getTrainingProgress()}% complete
                      </Text>
                    </div>

                    {/* Last updated timestamp */}
                    <Text variant="bodySm">
                      Last checked: {new Date().toLocaleTimeString()}
                    </Text>
                  </>
                )}

                {trainingData.status !== "processing" && (
                  <Text>
                    Your AI assistant has completed training and is ready to
                    use!
                  </Text>
                )}

                {/* Only show Refresh Status button if training is still in progress */}
                {/* {trainingData.status === "processing" && (
                  <Button onClick={handleViewStatus} size="slim">
                    Refresh Status
                  </Button>
                )} */}

                {trainingData.status === "processing" && (
                  <Text variant="bodySm">
                    Note: Do not close this page while training is in progress.
                    You can leave the page and do other things, but do not close
                    it. It will stop the training.
                  </Text>
                )}
              </BlockStack>
            </Banner>
          )}

        <Layout>
          <Layout.Section>
            <Card padding="500">
              <BlockStack gap="600">
                <Text as="h2" variant="headingLg">
                  Dashboard
                </Text>
                {error &&
                  (typeof error === "string" ? (
                    <Banner status="critical">
                      <p>{error}</p>
                    </Banner>
                  ) : (
                    error
                  ))}
                {accessKey ? (
                  isDataLoading ? (
                    <BlockStack gap="400" align="center">
                      <div style={{ padding: "32px 0" }}>
                        <Text as="p" variant="bodyMd" alignment="center">
                          Loading your dashboard data...
                        </Text>
                        <div
                          style={{ margin: "16px auto", textAlign: "center" }}
                        >
                          <spinner-icon></spinner-icon>
                        </div>
                      </div>
                    </BlockStack>
                  ) : (
                    <BlockStack gap="500">
                      {/* Content appears here after loading */}
                    </BlockStack>
                  )
                ) : (
                  <>
                    <BlockStack gap="500">
                      <Card>
                        <Text as="h3" variant="headingMd">
                          <InlineStack gap="200" blockAlign="center">
                            <div
                              style={{
                                width: "24px",
                                display: "flex",
                                justifyContent: "center",
                              }}
                            >
                              <Icon source={KeyIcon} color="highlight" />
                            </div>
                            <Text variant="headingMd">
                              Option 1: Enter Access Key
                            </Text>
                          </InlineStack>
                        </Text>
                        <div style={{ padding: "16px 0" }}>
                          <BlockStack gap="300">
                            <TextField
                              label="Access Key"
                              value={accessKey}
                              onChange={setAccessKey}
                              autoComplete="off"
                              placeholder="Enter your access key"
                              error={error}
                              disabled={isConnecting}
                            />
                            <Button
                              primary
                              fullWidth
                              loading={isConnecting}
                              onClick={handleManualConnect}
                            >
                              {isConnecting
                                ? "Connecting..."
                                : "Connect with Access Key"}
                            </Button>
                          </BlockStack>
                        </div>
                      </Card>

                      <Card>
                        <Text as="h3" variant="headingMd">
                          <InlineStack gap="200" blockAlign="center">
                            <div
                              style={{
                                width: "24px",
                                display: "flex",
                                justifyContent: "center",
                              }}
                            >
                              <Icon source={GlobeIcon} color="highlight" />
                            </div>
                            <Text variant="headingMd">
                              Option 2: Quick Connect
                            </Text>
                          </InlineStack>
                        </Text>
                        <div style={{ padding: "16px 0" }}>
                          <Button
                            fullWidth
                            onClick={handleQuickConnect}
                            loading={
                              isLoading &&
                              fetcher.formData?.get("action") ===
                                "quick_connect"
                            }
                          >
                            One-Click Connect
                          </Button>
                        </div>
                      </Card>
                    </BlockStack>
                  </>
                )}
                {fetcher.data && !fetcher.data.redirectUrl && (
                  <BlockStack gap="600">
                    {fetcher.data.success ? (
                      <>
                        {/* Website Information Card */}
                        <Card padding="500">
                          <BlockStack gap="500">
                            <InlineStack align="space-between">
                              <InlineStack gap="200" blockAlign="center">
                                <div
                                  style={{
                                    width: "24px",
                                    display: "flex",
                                    justifyContent: "center",
                                  }}
                                >
                                  <Icon source={GlobeIcon} color="highlight" />
                                </div>
                                <Text as="h3" variant="headingMd">
                                  Website Information
                                </Text>
                              </InlineStack>
                              <InlineStack gap="300">
                                <Button
                                  primary
                                  external
                                  icon={ExternalIcon}
                                  onClick={() => {
                                    window.open(
                                      `${urls.voiceroApi}/app/websites/website?id=${fetcher.data.websiteData.id}`,
                                      "_blank",
                                    );
                                  }}
                                >
                                  Open Dashboard
                                </Button>
                                <Button
                                  icon={SettingsIcon}
                                  onClick={() => navigate("/app/settings")}
                                >
                                  Settings
                                </Button>
                              </InlineStack>
                            </InlineStack>
                            <Divider />
                            <Card subdued>
                              <BlockStack gap="400">
                                <InlineStack gap="200" wrap={false}>
                                  <Box width="30px">
                                    <Icon source={InfoIcon} color="base" />
                                  </Box>
                                  <div style={{ width: "30%" }}>
                                    <Text variant="bodyMd" fontWeight="bold">
                                      Name
                                    </Text>
                                  </div>
                                  <div style={{ width: "70%" }}>
                                    <Text variant="bodyMd">
                                      {fetcher.data.websiteData.name}
                                    </Text>
                                  </div>
                                </InlineStack>

                                <InlineStack gap="200" wrap={false}>
                                  <Box width="30px">
                                    <Icon source={GlobeIcon} color="base" />
                                  </Box>
                                  <div style={{ width: "30%" }}>
                                    <Text variant="bodyMd" fontWeight="bold">
                                      URL
                                    </Text>
                                  </div>
                                  <div style={{ width: "70%" }}>
                                    <Link
                                      url={fetcher.data.websiteData.url}
                                      external
                                      monochrome
                                    >
                                      {fetcher.data.websiteData.url}
                                    </Link>
                                  </div>
                                </InlineStack>

                                <InlineStack gap="200" wrap={false}>
                                  <Box width="30px">
                                    <Icon source={InfoIcon} color="base" />
                                  </Box>
                                  <div style={{ width: "30%" }}>
                                    <Text variant="bodyMd" fontWeight="bold">
                                      Type
                                    </Text>
                                  </div>
                                  <div style={{ width: "70%" }}>
                                    <Text variant="bodyMd">
                                      {fetcher.data.websiteData.type}
                                    </Text>
                                  </div>
                                </InlineStack>

                                <InlineStack gap="200" wrap={false}>
                                  <Box width="30px">
                                    <Icon
                                      source={DataPresentationIcon}
                                      color="base"
                                    />
                                  </Box>
                                  <div style={{ width: "30%" }}>
                                    <Text variant="bodyMd" fontWeight="bold">
                                      Plan
                                    </Text>
                                  </div>
                                  <div style={{ width: "70%" }}>
                                    <Text variant="bodyMd">
                                      {fetcher.data.websiteData.plan}
                                    </Text>
                                  </div>
                                </InlineStack>

                                <InlineStack
                                  gap="200"
                                  wrap={false}
                                  align="start"
                                >
                                  <Box width="30px">
                                    <Icon
                                      source={
                                        fetcher.data.websiteData.active
                                          ? ToggleOnIcon
                                          : ToggleOffIcon
                                      }
                                      color={
                                        fetcher.data.websiteData.active
                                          ? "success"
                                          : "critical"
                                      }
                                    />
                                  </Box>
                                  <div style={{ width: "30%" }}>
                                    <Text variant="bodyMd" fontWeight="bold">
                                      Status
                                    </Text>
                                  </div>
                                  <div style={{ width: "70%" }}>
                                    <InlineStack
                                      gap="300"
                                      align="start"
                                      blockAlign="center"
                                    >
                                      <div>
                                        <Text
                                          variant="bodyMd"
                                          tone={
                                            fetcher.data.websiteData.active
                                              ? "success"
                                              : "critical"
                                          }
                                        >
                                          {fetcher.data.websiteData.active
                                            ? "Active"
                                            : "Inactive"}
                                        </Text>
                                      </div>
                                      <div>
                                        <Button
                                          size="slim"
                                          onClick={() => {
                                            fetch(
                                              `${urls.voiceroApi}/api/websites/toggle-status`,
                                              {
                                                method: "POST",
                                                headers: {
                                                  "Content-Type":
                                                    "application/json",
                                                  Accept: "application/json",
                                                  Authorization: `Bearer ${accessKey.trim()}`,
                                                },
                                                body: JSON.stringify({
                                                  accessKey: accessKey.trim(),
                                                }),
                                              },
                                            )
                                              .then((response) => {
                                                if (!response.ok) {
                                                  throw new Error(
                                                    `HTTP error! status: ${response.status}`,
                                                  );
                                                }
                                                // Refresh the website data
                                                fetcher.submit(
                                                  {
                                                    accessKey,
                                                    action: "manual_connect",
                                                  },
                                                  { method: "POST" },
                                                );
                                              })
                                              .catch((error) => {
                                                console.error(
                                                  "Error toggling status:",
                                                  error,
                                                );
                                                setError(
                                                  "Failed to toggle website status",
                                                );
                                              });
                                          }}
                                          disabled={
                                            !fetcher.data.websiteData
                                              .lastSyncedAt ||
                                            fetcher.data.websiteData
                                              .lastSyncedAt === "Never"
                                          }
                                        >
                                          {fetcher.data.websiteData
                                            .lastSyncedAt &&
                                          fetcher.data.websiteData
                                            .lastSyncedAt !== "Never"
                                            ? fetcher.data.websiteData.active
                                              ? "Deactivate"
                                              : "Activate"
                                            : "Sync Required"}
                                        </Button>
                                      </div>
                                    </InlineStack>
                                    {(!fetcher.data.websiteData.lastSyncedAt ||
                                      fetcher.data.websiteData.lastSyncedAt ===
                                        "Never") && (
                                      <Text
                                        as="p"
                                        variant="bodySm"
                                        tone="critical"
                                      >
                                        Please sync your website content first
                                      </Text>
                                    )}
                                  </div>
                                </InlineStack>

                                <InlineStack gap="200" wrap={false}>
                                  <Box width="30px">
                                    <Icon
                                      source={QuestionCircleIcon}
                                      color="base"
                                    />
                                  </Box>
                                  <div style={{ width: "30%" }}>
                                    <Text variant="bodyMd" fontWeight="bold">
                                      Query Limit
                                    </Text>
                                  </div>
                                  <div style={{ width: "70%" }}>
                                    <Text variant="bodyMd">
                                      {fetcher.data.websiteData.queryLimit}
                                    </Text>
                                  </div>
                                </InlineStack>

                                <InlineStack gap="200" wrap={false}>
                                  <Box width="30px">
                                    <Icon source={CalendarIcon} color="base" />
                                  </Box>
                                  <div style={{ width: "30%" }}>
                                    <Text variant="bodyMd" fontWeight="bold">
                                      Last Synced
                                    </Text>
                                  </div>
                                  <div style={{ width: "70%" }}>
                                    <Text
                                      variant="bodyMd"
                                      tone={
                                        fetcher.data.websiteData.lastSyncedAt &&
                                        fetcher.data.websiteData
                                          .lastSyncedAt !== "Never"
                                          ? "success"
                                          : "caution"
                                      }
                                    >
                                      {fetcher.data.websiteData.lastSyncedAt
                                        ? fetcher.data.websiteData
                                            .lastSyncedAt === "Never"
                                          ? "Never"
                                          : new Date(
                                              fetcher.data.websiteData.lastSyncedAt,
                                            ).toLocaleString()
                                        : "Never"}
                                    </Text>
                                  </div>
                                </InlineStack>
                              </BlockStack>
                            </Card>
                          </BlockStack>
                        </Card>

                        {/* Content Overview Card */}
                        <Card padding="500">
                          <BlockStack gap="500">
                            <InlineStack align="space-between">
                              <InlineStack gap="200" blockAlign="center">
                                <div
                                  style={{
                                    width: "24px",
                                    display: "flex",
                                    justifyContent: "center",
                                  }}
                                >
                                  <Icon
                                    source={DataPresentationIcon}
                                    color="highlight"
                                  />
                                </div>
                                <Text as="h3" variant="headingMd">
                                  Content Overview
                                </Text>
                              </InlineStack>
                              <Button
                                onClick={handleSync}
                                loading={isSyncing}
                                icon={RefreshIcon}
                                primary={
                                  !fetcher.data.websiteData.lastSyncedAt ||
                                  fetcher.data.websiteData.lastSyncedAt ===
                                    "Never"
                                }
                              >
                                {isSyncing ? "Syncing..." : "Sync Content"}
                              </Button>
                            </InlineStack>
                            <Divider />
                            <BlockStack gap="400">
                              <Card subdued>
                                <BlockStack gap="500">
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "1fr 1fr",
                                      gap: "16px",
                                    }}
                                  >
                                    <Card padding="400">
                                      <BlockStack gap="200" align="center">
                                        <Icon
                                          source={PageIcon}
                                          color="primary"
                                          backdrop
                                          size="large"
                                        />
                                        <Text
                                          variant="headingXl"
                                          fontWeight="bold"
                                          alignment="center"
                                        >
                                          {
                                            fetcher.data.websiteData._count
                                              .pages
                                          }
                                        </Text>
                                        <Text
                                          variant="bodySm"
                                          alignment="center"
                                        >
                                          Pages
                                        </Text>
                                      </BlockStack>
                                    </Card>

                                    <Card padding="400">
                                      <BlockStack gap="200" align="center">
                                        <Icon
                                          source={BlogIcon}
                                          color="primary"
                                          backdrop
                                          size="large"
                                        />
                                        <Text
                                          variant="headingXl"
                                          fontWeight="bold"
                                          alignment="center"
                                        >
                                          {
                                            fetcher.data.websiteData._count
                                              .posts
                                          }
                                        </Text>
                                        <Text
                                          variant="bodySm"
                                          alignment="center"
                                        >
                                          Posts
                                        </Text>
                                      </BlockStack>
                                    </Card>

                                    <Card padding="400">
                                      <BlockStack gap="200" align="center">
                                        <Icon
                                          source={ProductIcon}
                                          color="primary"
                                          backdrop
                                          size="large"
                                        />
                                        <Text
                                          variant="headingXl"
                                          fontWeight="bold"
                                          alignment="center"
                                        >
                                          {
                                            fetcher.data.websiteData._count
                                              .products
                                          }
                                        </Text>
                                        <Text
                                          variant="bodySm"
                                          alignment="center"
                                        >
                                          Products
                                        </Text>
                                      </BlockStack>
                                    </Card>

                                    <Card padding="400">
                                      <BlockStack gap="200" align="center">
                                        <Icon
                                          source={DiscountIcon}
                                          color="primary"
                                          backdrop
                                          size="large"
                                        />
                                        <Text
                                          variant="headingXl"
                                          fontWeight="bold"
                                          alignment="center"
                                        >
                                          {
                                            fetcher.data.websiteData._count
                                              .discounts
                                          }
                                        </Text>
                                        <Text
                                          variant="bodySm"
                                          alignment="center"
                                        >
                                          Discounts
                                        </Text>
                                      </BlockStack>
                                    </Card>
                                  </div>

                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "1fr 1fr",
                                      gap: "16px",
                                    }}
                                  >
                                    <Card padding="400">
                                      <BlockStack gap="200" align="center">
                                        <Icon
                                          source={CollectionIcon}
                                          color="primary"
                                          backdrop
                                          size="large"
                                        />
                                        <Text
                                          variant="headingXl"
                                          fontWeight="bold"
                                          alignment="center"
                                        >
                                          {fetcher.data.websiteData._count
                                            .collections || 0}
                                        </Text>
                                        <Text
                                          variant="bodySm"
                                          alignment="center"
                                        >
                                          Collections
                                        </Text>
                                      </BlockStack>
                                    </Card>
                                    <Card padding="400">
                                      <BlockStack gap="200" align="center">
                                        <Icon
                                          source={QuestionCircleIcon}
                                          color="primary"
                                          backdrop
                                          size="large"
                                        />
                                        <Text
                                          variant="headingXl"
                                          fontWeight="bold"
                                          alignment="center"
                                        >
                                          {
                                            fetcher.data.websiteData
                                              .monthlyQueries
                                          }
                                        </Text>
                                        <Text
                                          variant="bodySm"
                                          alignment="center"
                                        >
                                          Monthly Queries
                                        </Text>
                                      </BlockStack>
                                    </Card>
                                  </div>
                                </BlockStack>
                              </Card>

                              <Text
                                variant="bodySm"
                                tone="subdued"
                                alignment="center"
                              >
                                Last synced{" "}
                                {fetcher.data.websiteData.lastSyncedAt &&
                                fetcher.data.websiteData.lastSyncedAt !==
                                  "Never"
                                  ? new Date(
                                      fetcher.data.websiteData.lastSyncedAt,
                                    ).toLocaleString()
                                  : "Never"}
                              </Text>
                            </BlockStack>
                          </BlockStack>
                        </Card>

                        {/* AI Assistant Settings Card */}
                        <Card padding="500">
                          <BlockStack gap="500">
                            <InlineStack gap="200" blockAlign="center">
                              <div
                                style={{
                                  width: "24px",
                                  display: "flex",
                                  justifyContent: "center",
                                }}
                              >
                                <Icon source={ChatIcon} color="highlight" />
                              </div>
                              <Text as="h3" variant="headingLg">
                                AI Assistant Settings
                              </Text>
                            </InlineStack>
                            <Divider />
                            <Card subdued>
                              <BlockStack gap="400">
                                <InlineStack align="center" gap="300">
                                  <Box width="30px">
                                    <Icon
                                      source={
                                        fetcher.data.websiteData.active
                                          ? ToggleOnIcon
                                          : ToggleOffIcon
                                      }
                                      color={
                                        fetcher.data.websiteData.active
                                          ? "success"
                                          : "critical"
                                      }
                                    />
                                  </Box>
                                  <div style={{ minWidth: "100px" }}>
                                    <Text variant="bodyMd" fontWeight="bold">
                                      Status
                                    </Text>
                                  </div>
                                  <Text
                                    variant="bodyMd"
                                    tone={
                                      fetcher.data.websiteData.active
                                        ? "success"
                                        : "critical"
                                    }
                                  >
                                    {fetcher.data.websiteData.active
                                      ? "Active"
                                      : "Inactive"}
                                  </Text>
                                </InlineStack>

                                <InlineStack align="center" gap="300">
                                  <Box width="30px">
                                    <Icon source={ChatIcon} color="base" />
                                  </Box>
                                  <div style={{ minWidth: "100px" }}>
                                    <Text variant="bodyMd" fontWeight="bold">
                                      Assistant Type
                                    </Text>
                                  </div>
                                  <Text variant="bodyMd">
                                    Shopify Store Assistant
                                  </Text>
                                </InlineStack>
                              </BlockStack>
                            </Card>

                            <BlockStack gap="300">
                              <Text variant="bodyMd">
                                Your AI assistant helps customers find products,
                                answer questions, and provide support on your
                                Shopify store.
                              </Text>
                              <InlineStack gap="300">
                                <Button
                                  external
                                  icon={SettingsIcon}
                                  onClick={() => {
                                    window.open(
                                      `${urls.voiceroApi}/app/websites/website?id=${fetcher.data.websiteData.id}&tab=assistant`,
                                      "_blank",
                                    );
                                  }}
                                >
                                  Customize Assistant
                                </Button>
                                <Button
                                  external
                                  icon={ExternalIcon}
                                  onClick={() => {
                                    window.open(
                                      `${urls.voiceroApi}/app/websites/website?id=${fetcher.data.websiteData.id}&tab=preview`,
                                      "_blank",
                                    );
                                  }}
                                >
                                  Preview Assistant
                                </Button>
                              </InlineStack>
                            </BlockStack>
                          </BlockStack>
                        </Card>
                      </>
                    ) : (
                      <Banner status="critical">
                        <Text as="p">
                          Unable to connect:{" "}
                          {fetcher.data.error || "Please try again"}
                        </Text>
                      </Banner>
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
