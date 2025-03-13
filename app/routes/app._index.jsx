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
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import urls from "../config/urls";

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

      // Create headers with URLSearchParams to ensure proper formatting
      const headers = new Headers();
      headers.append("Accept", "application/json");
      headers.append("Authorization", `Bearer ${trimmedKey}`);

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

        const responseText = await testResponse.text();

        try {
          const responseData = JSON.parse(responseText);
          // Only set isConnected to true if we have valid website data
          isConnected = testResponse.ok && responseData.website;
        } catch (e) {
          isConnected = false;
        }
      }
    } catch (error) {
      isConnected = false;
    }
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
      try {
        const trimmedKey = accessKey?.trim();

        if (!trimmedKey) {
          throw new Error("No access key provided");
        }

        const headers = new Headers();
        headers.append("Accept", "application/json");
        headers.append("Authorization", `Bearer ${trimmedKey}`);

        const response = await fetch("http://localhost:3000/api/connect", {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${trimmedKey}`,
          },
          mode: "cors",
        });

        const responseText = await response.text();

        if (!response.ok) {
          throw new Error(`Connection failed with status: ${response.status}`);
        }

        const data = JSON.parse(responseText);

        // Update theme settings directly using the admin API
        const shopResponse = await admin.graphql(`
          query {
            shop {
              id
            }
          }
        `);

        const shopData = await shopResponse.json();
        const shopId = shopData.data.shop.id;

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

        if (metafieldData.data?.metafieldsSet?.userErrors?.length > 0) {
          throw new Error("Failed to save access key to store");
        }

        return {
          success: true,
          accessKey: accessKey,
          message: `Successfully connected to ${data.website?.name || "website"}!`,
          websiteData: data.website,
          namespace: data.website?.VectorDbConfig?.namespace || data.namespace,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    }
  } catch (error) {
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

export default function Index() {
  const { savedKey } = useLoaderData();

  // State to track active training process
  const [trainingData, setTrainingData] = useState(null);
  const [trainingInterval, setTrainingInterval] = useState(null);
  // Track consecutive failures
  const [failureCount, setFailureCount] = useState(0);
  const MAX_FAILURES = 5; // Stop after 5 consecutive failures

  // Get API key from saved key (from loader data)
  const apiKey = savedKey;

  // State for UI and data
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
  const [namespace, setNamespace] = useState(null);
  const [statusData, setStatusData] = useState(null);
  const [trainingStatus, setTrainingStatus] = useState(null);
  const [statusCheckCount, setStatusCheckCount] = useState(0);

  // Handle successful connection response
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data.accessKey) {
      setAccessKey(fetcher.data.accessKey);
    }

    // Check if we got a response with namespace data
    if (fetcher.data?.namespace) {
      setNamespace(fetcher.data.namespace);
    }
    // Check if we have namespace in VectorDbConfig
    else if (fetcher.data?.websiteData?.VectorDbConfig?.namespace) {
      const websiteNamespace =
        fetcher.data.websiteData.VectorDbConfig.namespace;
      setNamespace(websiteNamespace);
    }
  }, [fetcher.data]);

  // Single useEffect for status checking - runs when component mounts or namespace changes
  useEffect(() => {
    if (namespace) {
      checkTrainingStatus();
    }

    return () => {
      if (trainingInterval) {
        clearInterval(trainingInterval);
      }
    };
  }, [namespace]); // Run when namespace changes

  // Function to check training status
  const checkTrainingStatus = useCallback(() => {
    // Check if we have the necessary credentials
    if (!apiKey) {
      return;
    }

    // Use the user's namespace
    const namespaceToUse = namespace;

    if (!namespaceToUse) {
      return;
    }

    fetch(`${urls.trainingApiStatus}/${namespaceToUse}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Status API returned ${res.status}`);
        return res.json();
      })
      .then((data) => {
        // Reset failure count on success
        if (failureCount > 0) setFailureCount(0);

        // Store the training data in state
        setTrainingData(data.data);

        // If process is complete or not running, clear the interval
        if (
          data.data?.status === "complete" ||
          data.data?.status === "done" ||
          data.data?.status === "success" ||
          data.data?.status === "finished" ||
          data.data?.status === "not_running"
        ) {
          if (trainingInterval) {
            clearInterval(trainingInterval);
            setTrainingInterval(null);
          }
        }
      })
      .catch((err) => {
        // Increment failure count
        const newFailureCount = failureCount + 1;
        setFailureCount(newFailureCount);

        // Stop checking after MAX_FAILURES consecutive failures
        if (newFailureCount >= MAX_FAILURES) {
          if (trainingInterval) {
            clearInterval(trainingInterval);
            setTrainingInterval(null);

            // Show error message to user
            setError(
              <Banner status="critical" onDismiss={() => setError("")}>
                <p>
                  Status checking has been paused due to repeated connection
                  failures.
                </p>
                <p>Click "View Status" to try again manually.</p>
              </Banner>,
            );
          }
        }
      });
  }, [apiKey, trainingInterval, namespace, failureCount]);

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

  // Reset data loading state when we get data back from fetcher
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
    if (!accessKey) {
      setError("Please enter an access key");
      return;
    }
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

  // Function to manually refresh status without setting up an interval
  const handleRefreshStatus = useCallback(() => {
    checkTrainingStatus();
  }, [checkTrainingStatus]);

  const handleQuickConnect = () => {
    fetcher.submit({ action: "quick_connect" }, { method: "POST" });
  };

  const handleDisconnect = () => {
    try {
      // Reset all state
      setAccessKey("");
      setNamespace(null);
      setTrainingData(null);
      if (trainingInterval) {
        clearInterval(trainingInterval);
        setTrainingInterval(null);
      }

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
    try {
      setIsSyncing(true);
      setError(""); // Clear any previous errors

      // Step 1: Initial sync
      const syncInitResponse = await fetch("/api/sync", {
        method: "GET",
      });

      const responseText = await syncInitResponse.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Invalid JSON response: ${responseText}`);
      }

      if (!syncInitResponse.ok) {
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
        throw new Error(
          `Sync error! status: ${syncResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }

      // Step 3: Start vectorization
      setLoadingText(
        "Vectorizing your store content... This may take a few minutes.",
      );

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
        throw new Error(
          `Vectorization error! status: ${vectorizeResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }

      // Process the regular JSON response
      const vectorizeData = await vectorizeResponse.json();

      // Check if the vectorization was successful
      if (!vectorizeData.success) {
        throw new Error(
          `Vectorization failed: ${vectorizeData.error || "Unknown error"}`,
        );
      }

      // Show some stats if available
      if (vectorizeData.stats) {
        setLoadingText(
          `Vectorization complete! Added ${vectorizeData.stats.added} items to the vector database.`,
        );
      } else {
        setLoadingText("Vectorization completed successfully!");
      }

      // Step 4: Create or get assistant
      setLoadingText("Setting up your AI assistant...");
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
        throw new Error(
          `Assistant setup error! status: ${assistantResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }

      // Step 5: Start auto-training process
      setIsTraining(true);
      setLoadingText(
        "Starting auto-training process. This typically takes 10-20 minutes to complete.",
      );

      // Try different approaches to find the namespace
      let foundNamespace = null;

      // 1. Check from the original data structure
      if (
        data &&
        data.website &&
        data.website.VectorDbConfig &&
        data.website.VectorDbConfig.namespace
      ) {
        foundNamespace = data.website.VectorDbConfig.namespace;
        setNamespace(foundNamespace);
      }
      // 2. If not in website data, try from assistantResponse
      else if (assistantResponse && assistantResponse.ok) {
        try {
          const assistantData = await assistantResponse.json();

          if (
            assistantData &&
            assistantData.website &&
            assistantData.website.VectorDbConfig
          ) {
            foundNamespace = assistantData.website.VectorDbConfig.namespace;
            setNamespace(foundNamespace);
          }
        } catch (err) {
          // Handle error silently
        }
      }

      // 3. As a last resort, try to get it from backend directly
      if (!foundNamespace) {
        try {
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

            if (
              websiteData &&
              websiteData.website &&
              websiteData.website.VectorDbConfig
            ) {
              foundNamespace = websiteData.website.VectorDbConfig.namespace;
              setNamespace(foundNamespace);
            } else if (
              websiteData &&
              websiteData.website &&
              websiteData.website.id
            ) {
              // Use website ID as namespace as a fallback
              foundNamespace = websiteData.website.id;
              setNamespace(foundNamespace);
            }
          }
        } catch (err) {
          // Handle error silently
        }
      }

      if (!foundNamespace) {
        throw new Error("No namespace found for auto-training");
      }

      // Start the auto-training process
      const autoTrainResponse = await fetch(
        `${urls.trainingApiAuto}/${foundNamespace}`,
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
        throw new Error(
          `Auto-training initiation error! status: ${autoTrainResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }

      // Clear any existing interval
      if (trainingInterval) {
        clearInterval(trainingInterval);
        setTrainingInterval(null);
      }

      // Set up new status check interval
      const newInterval = setInterval(checkTrainingStatus, 30000);
      setTrainingInterval(newInterval);

      // Do an immediate check to update UI
      checkTrainingStatus();

      // Show training in progress message
      setLoadingText(
        "Auto-training in progress. This typically takes 10-20 minutes to complete. You can now navigate away from this page - the process will continue in the background.",
      );

      setIsTraining(true);
      setIsSuccess(true);
      setIsSyncing(false);
    } catch (error) {
      setError(
        <Banner status="critical" onDismiss={() => setError("")}>
          <p>Failed to sync content: {error.message}</p>
        </Banner>,
      );
      setIsSyncing(false);
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
    try {
      setIsDataLoading(true);
      setError("");

      // Reset failure count when manually checking
      setFailureCount(0);

      // Check if we have the namespace
      if (!namespace) {
        setError("No namespace found. Please connect to your website first.");
        setIsDataLoading(false);
        return;
      }

      // If interval was stopped due to failures or not_running, restart it for manual check
      if (!trainingInterval) {
        checkTrainingStatus(); // Do an immediate check

        // Only set up a new interval if the check doesn't immediately return not_running
        // The interval will be cleared automatically if status is not_running
        const interval = setInterval(checkTrainingStatus, 30000);
        setTrainingInterval(interval);
      } else {
        // Just do a single check if the interval is already running
        checkTrainingStatus();
      }

      // Show current data in a banner if we have it
      if (trainingData) {
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
        setError(
          <Banner status="info" onDismiss={() => setError("")}>
            <p>Checking status... Results will appear in 1-2 seconds.</p>
          </Banner>,
        );
      }
    } catch (error) {
      setError(`Error checking status: ${error.message}`);
    } finally {
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
                {trainingData.status === "processing" && (
                  <Button onClick={handleRefreshStatus} size="slim">
                    Refresh Status
                  </Button>
                )}

                {trainingData.status === "processing" && (
                  <Text variant="bodySm">
                    Note: You can leave this page running and it will continue
                    to train in the background. At this point you can activate
                    your assistant by clicking "activate"
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
