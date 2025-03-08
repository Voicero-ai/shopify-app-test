import { useState, useEffect } from "react";
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
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

export const dynamic = "force-dynamic";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Get subscription status
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
  const subscriptions = data.data.appInstallation.activeSubscriptions;
  const isPro = subscriptions.some(
    (sub) =>
      sub.status === "ACTIVE" &&
      sub.lineItems[0]?.plan?.pricingDetails?.price?.amount > 0,
  );

  // Get access key from metafields
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
  const savedKey = metafieldData.data.shop.metafield?.value;

  let isConnected = false;
  if (savedKey) {
    try {
      const trimmedKey = savedKey.trim();
      console.log("Raw saved key:", savedKey);
      console.log("Trimmed key:", trimmedKey);
      console.log("Key length before trim:", savedKey.length);
      console.log("Key length after trim:", trimmedKey.length);

      // Create headers with URLSearchParams to ensure proper formatting
      const headers = new Headers();
      headers.append("Accept", "application/json");
      headers.append("Authorization", `Bearer ${trimmedKey}`);

      // Log each header individually
      headers.forEach((value, name) => {
        console.log(`Header ${name}:`, value);
      });

      if (trimmedKey) {
        const testResponse = await fetch("http://localhost:3000/api/connect", {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${trimmedKey}`,
          },
          mode: "cors",
        });

        // Log complete response information
        console.log("Response status:", testResponse.status);
        console.log("Response status text:", testResponse.statusText);

        const responseText = await testResponse.text();
        console.log("Raw response body:", responseText);

        try {
          const responseData = JSON.parse(responseText);
          console.log("Parsed response:", responseData);
          // Only set isConnected to true if we have valid website data
          isConnected = testResponse.ok && responseData.website;
        } catch (e) {
          console.log("Could not parse response as JSON:", e);
          isConnected = false;
        }
      }
    } catch (error) {
      console.error("Detailed connection error:", error);
      isConnected = false;
    }
  } else {
    console.log("No saved key found in metafields");
  }

  return json({
    isPro,
    apiKey: process.env.SHOPIFY_API_KEY || "",
    savedKey: isConnected ? savedKey : null,
  });
};
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const accessKey = formData.get("accessKey");
  const action = formData.get("action");

  try {
    if (action === "quick_connect") {
      const shop = session.shop;
      const storeName = shop.split(".")[0];
      const appHandle = process.env.SHOPIFY_APP_HANDLE || "voicero-app-shop";
      const site_url = encodeURIComponent(`https://${shop}`);
      const admin_url = encodeURIComponent(
        `https://admin.shopify.com/store/${storeName}/apps/${appHandle}/app`,
      );

      return {
        success: true,
        redirectUrl: `http://localhost:3000/app/connect?site_url=${site_url}&redirect_url=${admin_url}&type=Shopify`,
      };
    } else if (action === "manual_connect") {
      console.log("Starting manual connect with raw access key:", accessKey);

      try {
        const trimmedKey = accessKey?.trim();
        console.log("Raw key:", accessKey);
        console.log("Trimmed key:", trimmedKey);
        console.log("Key length before trim:", accessKey?.length);
        console.log("Key length after trim:", trimmedKey?.length);

        if (!trimmedKey) {
          throw new Error("No access key provided");
        }

        // Create headers with Headers API
        const headers = new Headers();
        headers.append("Accept", "application/json");
        headers.append("Authorization", `Bearer ${trimmedKey}`);

        // Log each header individually
        headers.forEach((value, name) => {
          console.log(`Header ${name}:`, value);
        });

        console.log("Making API request to verify connection...");
        const response = await fetch("http://localhost:3000/api/connect", {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${trimmedKey}`,
          },
          mode: "cors",
        });

        // Log complete response information
        console.log("Response status:", response.status);
        console.log("Response status text:", response.statusText);

        const responseText = await response.text();
        console.log("Raw response body:", responseText);

        try {
          const responseData = JSON.parse(responseText);
          console.log("Parsed response:", responseData);
        } catch (e) {
          console.log("Could not parse response as JSON:", e);
        }

        if (!response.ok) {
          throw new Error(`Connection failed with status: ${response.status}`);
        }

        const data = JSON.parse(responseText);
        console.log("API connection response:", data);

        // Update theme settings directly using the admin API
        // First get the shop ID
        const shopResponse = await admin.graphql(`
          query {
            shop {
              id
            }
          }
        `);

        const shopData = await shopResponse.json();
        console.log("Shop data:", shopData);

        const shopId = shopData.data.shop.id;
        console.log("Shop ID:", shopId);

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
        console.log("Metafield update response:", metafieldData);

        if (metafieldData.data?.metafieldsSet?.userErrors?.length > 0) {
          console.error(
            "Failed to save access key:",
            metafieldData.data.metafieldsSet.userErrors,
          );
          throw new Error("Failed to save access key to store");
        }

        return {
          success: true,
          accessKey: accessKey,
          message: `Successfully connected to ${data.website?.name || "website"}!`,
          websiteData: data.website,
        };
      } catch (error) {
        console.error("Detailed connection error:", error);
        return {
          success: false,
          error: error.message,
        };
      }
    }
  } catch (error) {
    console.error("Connection error:", error);
    let errorMessage = error.message;

    if (error.response) {
      try {
        const errorData = await error.response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // If we can't parse the error response, stick with the original message
      }
    }

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
  console.log(
    "All themes data:",
    JSON.stringify(data.data.themes.nodes, null, 2),
  );

  // Find the main theme
  const mainTheme = data.data.themes.nodes.find(
    (theme) => theme.role === "MAIN",
  );

  if (!mainTheme) {
    // If no MAIN theme, try to find a PUBLISHED theme
    const publishedTheme = data.data.themes.nodes.find(
      (theme) => theme.role === "PUBLISHED",
    );
    console.log("Found published theme:", publishedTheme);
    return publishedTheme?.id;
  }

  console.log("Found main theme:", mainTheme);
  return mainTheme?.id;
}

async function updateThemeSettings(admin, themeId, accessKey) {
  if (!themeId) {
    console.error("No main theme found");
    return;
  }

  console.log("Attempting to update theme settings with:", {
    themeId,
    accessKey,
  });

  try {
    const themeIdNumber = themeId.split("/").pop();
    console.log("Getting theme assets for theme ID:", themeIdNumber);

    // Use standard REST API format
    const response = await admin.rest.get({
      path: `/themes/${themeIdNumber}/assets.json`,
    });

    console.log("Theme assets response:", response);

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

      console.log("Existing settings asset:", settingsAsset);

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
      console.log("No existing settings_data.json found, creating new one:", e);
    }

    // Update settings_data.json
    console.log("Updating settings_data.json with:", settingsData);

    const updateResponse = await admin.rest.put({
      path: `/themes/${themeIdNumber}/assets.json`,
      data: {
        asset: {
          key: "config/settings_data.json",
          value: JSON.stringify(settingsData, null, 2),
        },
      },
    });

    console.log("Settings update response:", updateResponse);

    if (updateResponse?.body?.asset) {
      console.log("Successfully updated theme settings");
    } else {
      console.error("Failed to update theme settings");
    }
  } catch (error) {
    console.error("Error updating theme settings:", error);
  }
}

export default function Index() {
  const { savedKey } = useLoaderData();
  const [accessKey, setAccessKey] = useState(savedKey || "");
  const fetcher = useFetcher();
  const app = useAppBridge();
  const navigate = useNavigate();
  const isLoading = fetcher.state === "submitting";
  const [error, setError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isTraining, setIsTraining] = useState(false);

  // Check URL parameters on mount for access key
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedAccessKey = params.get("access_key");
    if (returnedAccessKey) {
      window.localStorage?.setItem("voiceroAccessKey", returnedAccessKey);
      setAccessKey(returnedAccessKey);
      // Clean up the URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Handle successful connection response
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data.accessKey) {
      window.localStorage?.setItem("voiceroAccessKey", fetcher.data.accessKey);
      setAccessKey(fetcher.data.accessKey);
    }
  }, [fetcher.data]);

  // Auto-connect when we have an access key
  useEffect(() => {
    if (accessKey && !fetcher.data?.success) {
      // Only connect if we haven't already
      setIsDataLoading(true);
      fetcher.submit(
        { accessKey, action: "manual_connect" },
        { method: "POST" },
      );
    }
  }, [accessKey]);

  // Reset data loading state when we get data
  useEffect(() => {
    if (fetcher.data) {
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

  const handleManualConnect = () => {
    console.log("Manual connect button clicked");
    if (!accessKey) {
      console.log("No access key provided");
      setError("Please enter an access key");
      return;
    }
    console.log("Submitting manual connect with key:", accessKey);
    setError("");
    setIsConnecting(true);
    fetcher.submit(
      {
        accessKey,
        action: "manual_connect",
      },
      { method: "POST" },
    );
  };

  const handleQuickConnect = () => {
    fetcher.submit({ action: "quick_connect" }, { method: "POST" });
  };

  const handleDisconnect = () => {
    console.log("Disconnect initiated");

    try {
      // 1. Clear the main access key
      console.log("Removing voiceroAccessKey from localStorage");
      window.localStorage?.removeItem("voiceroAccessKey");

      // 2. Clear all voicero-related data from localStorage
      if (window.localStorage) {
        console.log("Clearing all Voicero data from localStorage");
        const keysToRemove = [];
        // Collect keys first to avoid modification during iteration
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key && key.startsWith("voicero")) {
            keysToRemove.push(key);
          }
        }
        // Then remove them
        keysToRemove.forEach((key) => {
          console.log(`Removing localStorage key: ${key}`);
          window.localStorage.removeItem(key);
        });
      }

      // 3. Reset state
      console.log("Resetting access key state");
      setAccessKey("");

      // 4. Clear any in-memory data
      if (fetcher) {
        console.log("Clearing fetcher data");
        if (fetcher.data) fetcher.data = null;

        // 5. Submit the disconnect action to the server
        console.log("Submitting disconnect action to server");
        fetcher.submit({ action: "disconnect" }, { method: "POST" });

        // 6. Navigate to home page after sufficient delay to allow server to process
        console.log("Setting up navigation delay");
        setTimeout(() => {
          console.log("Executing navigation to home page");
          // Use absolute path to ensure we get a full page load
          window.location.href = "/app";
        }, 2000); // 2-second delay to allow server processing
      }
    } catch (error) {
      console.error("Error during disconnect:", error);
      // Even if there's an error, try to reload
      window.location.href = "/app";
    }
  };

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      setError(""); // Clear any previous errors

      // Step 1: Initial sync
      console.log("Starting sync request...");
      const syncInitResponse = await fetch("/api/sync", {
        method: "GET",
      });

      const responseText = await syncInitResponse.text();
      console.log("Raw response:", responseText);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse response:", e);
        throw new Error(`Invalid JSON response: ${responseText}`);
      }

      if (!syncInitResponse.ok) {
        console.error("Sync response error:", data);
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
      console.log("Sync data received:", data);

      // Step 2: Send data to backend
      const syncResponse = await fetch(
        "http://localhost:3000/api/shopify/sync",
        {
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
        },
      );

      if (!syncResponse.ok) {
        const errorData = await syncResponse.json();
        console.error("Backend sync error:", errorData);
        throw new Error(
          `Sync error! status: ${syncResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }
      console.log("Sync response:", syncResponse);

      // Step 3: Start vectorization
      console.log("Starting vectorization...");
      const vectorizeResponse = await fetch(
        "http://localhost:3000/api/shopify/vectorize",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
        },
      );

      if (!vectorizeResponse.ok) {
        const errorData = await vectorizeResponse.json();
        console.error("Vectorization error:", errorData);
        throw new Error(
          `Vectorization error! status: ${vectorizeResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }

      console.log("Vectorization response:", vectorizeResponse);

      // Step 4: Create or get assistant
      console.log("Setting up AI assistant...");
      const assistantResponse = await fetch(
        "http://localhost:3000/api/shopify/assistant",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
        },
      );

      if (!assistantResponse.ok) {
        const errorData = await assistantResponse.json();
        console.error("Assistant setup error:", errorData);
        throw new Error(
          `Assistant setup error! status: ${assistantResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }

      // Step 5: Start auto-training process
      console.log("Starting auto-training process...");
      setIsTraining(true);
      setLoadingText(
        "Starting auto-training process. This typically takes 10-20 minutes to complete.",
      );

      // Get the namespace from the website data
      console.log("Full data structure:", JSON.stringify(data));

      // Try different approaches to find the namespace
      let namespace = null;

      // 1. Check from the original data structure
      if (
        data &&
        data.website &&
        data.website.VectorDbConfig &&
        data.website.VectorDbConfig.namespace
      ) {
        namespace = data.website.VectorDbConfig.namespace;
        console.log("Found namespace in website data:", namespace);
      }
      // 2. If not in website data, try from assistantResponse
      else if (assistantResponse && assistantResponse.ok) {
        try {
          const assistantData = await assistantResponse.json();
          console.log("Assistant response data:", assistantData);

          if (
            assistantData &&
            assistantData.website &&
            assistantData.website.VectorDbConfig
          ) {
            namespace = assistantData.website.VectorDbConfig.namespace;
            console.log("Found namespace in assistant response:", namespace);
          }
        } catch (err) {
          console.error("Error parsing assistant response:", err);
        }
      }

      // 3. As a last resort, try to get it from backend directly
      if (!namespace) {
        try {
          console.log(
            "Attempting to fetch website data directly for namespace",
          );
          const websiteResponse = await fetch(
            "http://localhost:3000/api/connect",
            {
              method: "GET",
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessKey}`,
              },
            },
          );

          if (websiteResponse.ok) {
            const websiteData = await websiteResponse.json();
            console.log("Website data response:", websiteData);

            if (
              websiteData &&
              websiteData.website &&
              websiteData.website.VectorDbConfig
            ) {
              namespace = websiteData.website.VectorDbConfig.namespace;
              console.log("Found namespace in website response:", namespace);
            } else if (
              websiteData &&
              websiteData.website &&
              websiteData.website.id
            ) {
              // Use website ID as namespace as a fallback (since in your data they're the same)
              namespace = websiteData.website.id;
              console.log("Using website ID as namespace fallback:", namespace);
            }
          }
        } catch (err) {
          console.error("Error fetching website data for namespace:", err);
        }
      }

      if (!namespace) {
        console.error("No namespace found in website data");
        throw new Error("No namespace found for auto-training");
      }

      console.log("Using namespace for auto-training:", namespace);

      // Start the auto-training process
      const autoTrainResponse = await fetch(
        `http://localhost:4000/auto/${namespace}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
        },
      );

      if (!autoTrainResponse.ok) {
        const errorData = await autoTrainResponse.json();
        console.error("Auto-training initiation error:", errorData);
        throw new Error(
          `Auto-training initiation error! status: ${autoTrainResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }

      console.log("Auto-training started successfully");

      // Poll for status until completion
      setLoadingText(
        "Auto-training in progress. This typically takes 10-20 minutes to complete. Please do not close this window.",
      );

      let isComplete = false;
      let pollCount = 0;
      const maxPolls = 120; // 20 minutes at 10-second intervals

      while (!isComplete && pollCount < maxPolls) {
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds between polls

        try {
          const statusResponse = await fetch(
            `http://localhost:4000/status/${namespace}`,
            {
              method: "GET",
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessKey}`,
              },
            },
          );

          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            console.log("Training status:", statusData);

            // Update loading text with progress information if available
            if (statusData.progress) {
              setLoadingText(
                `Auto-training in progress: ${statusData.progress}. Please do not close this window.`,
              );
            }

            // Check if the process is complete
            if (
              statusData.status === "success" ||
              statusData.status === "completed"
            ) {
              isComplete = true;
              console.log("Auto-training completed successfully");
            } else if (
              statusData.status === "failed" ||
              statusData.status === "error"
            ) {
              throw new Error(
                `Auto-training failed: ${statusData.message || "unknown error"}`,
              );
            }
          } else {
            console.warn("Failed to get training status, will retry");
          }
        } catch (error) {
          console.error("Error checking training status:", error);
          // Continue polling despite errors
        }

        pollCount++;
      }

      if (!isComplete) {
        console.warn(
          "Auto-training did not complete within the expected time frame",
        );
        setLoadingText(
          "Auto-training is taking longer than expected. You can check back later as the process will continue in the background.",
        );
      } else {
        setLoadingText("Auto-training completed successfully!");
      }

      setIsTraining(false);
      setIsSuccess(true);
      setIsSyncing(false);

      // Show success message
      setError(
        <Banner status="success" onDismiss={() => setError("")}>
          <p>
            Content synced successfully! We are finalizing your AI assistant on
            our backend. This will take between 15-30 minutes for completion. In
            the mean time you can activate your assistant by clicking the button
            below for your customers to start using it. You can leave this page
            if you need to.
          </p>
          <p>
            For immediate use, you can activate it now. For best results, we
            recommend waiting for the process to complete in 15-30 minutes.
            Click the button below to see the status of your assistant.
          </p>
          <Button primary fullWidth>
            View Assistant Status
          </Button>
        </Banner>,
      );
    } catch (error) {
      console.error("Detailed sync error:", error);
      setError(
        <Banner status="critical" onDismiss={() => setError("")}>
          <p>Failed to sync content: {error.message}</p>
        </Banner>,
      );
    }
  };

  return (
    <Page>
      <BlockStack gap="800">
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
                                      `http://localhost:3000/app/websites/website?id=${fetcher.data.websiteData.id}`,
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
                                              "http://localhost:3000/api/websites/toggle-status",
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
                                      <Text variant="bodySm" alignment="center">
                                        Monthly Queries
                                      </Text>
                                    </BlockStack>
                                  </Card>
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
                                      `http://localhost:3000/app/websites/website?id=${fetcher.data.websiteData.id}&tab=assistant`,
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
                                      `http://localhost:3000/app/websites/website?id=${fetcher.data.websiteData.id}&tab=preview`,
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
