import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useNavigate,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Box,
  Badge,
  Divider,
  Toast,
  ProgressBar,
  EmptyState,
  Icon,
  Frame,
} from "@shopify/polaris";
import {
  DataPresentationIcon,
  ChartVerticalIcon,
  ChatIcon,
  RefreshIcon,
  GlobeIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export const loader = async ({ request }) => {
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
    return json({
      disconnected: true,
      error: "No access key found",
    });
  }

  try {
    // Fetch website data from the connect API
    const response = await fetch(`${urls.voiceroApi}/api/connect`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    });

    if (!response.ok) {
      return json({
        error: "Failed to fetch website data",
      });
    }

    const data = await response.json();
    console.log("API Response:", data); // Console log the API output

    if (!data.website) {
      return json({
        error: "No website data found",
      });
    }

    // Now make a second API call to get AI history
    let aiHistoryData = null;
    let aiHistoryError = false;

    try {
      const historyResponse = await fetch(`/api/aiHistory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          websiteId: data.website.id,
          accessKey: accessKey,
        }),
      });

      if (historyResponse.ok) {
        aiHistoryData = await historyResponse.json();
        console.log("AI History Response:", aiHistoryData);
      } else {
        console.error(
          "Failed to fetch AI history data:",
          await historyResponse.text(),
        );
        aiHistoryError = true;
      }
    } catch (historyError) {
      console.error("Error fetching AI history:", historyError);
      aiHistoryError = true;
    }

    return json({
      websiteData: data.website,
      aiHistoryData,
      accessKey,
      aiHistoryError,
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    return json({
      error: error.message || "Failed to fetch website data",
    });
  }
};

// Helper function to check if we're running on client or server
// This is needed to handle the ProgressBar component which requires client-side rendering
function useIsClient() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient;
}

export default function AIOverviewPage() {
  const { websiteData, aiHistoryData, error, disconnected, aiHistoryError } =
    useLoaderData();
  const navigate = useNavigate();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");
  const isClient = useIsClient();

  // Redirect if disconnected
  useEffect(() => {
    if (disconnected) {
      navigate("/app");
    }
  }, [disconnected, navigate]);

  // Calculate usage percentages
  const monthlyUsage = websiteData?.monthlyUsage || 0;
  const monthlyQuota = websiteData?.monthlyQuota || 1000;
  const usagePercentage = Math.min(100, (monthlyUsage / monthlyQuota) * 100);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const toggleToast = () => setShowToast(!showToast);

  if (disconnected) {
    return null; // Don't render anything while redirecting
  }

  if (error) {
    return (
      <Frame>
        <Page>
          <EmptyState
            heading="Unable to load AI usage data"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            action={{ content: "Back to Dashboard", url: "/app" }}
          >
            <p>{error}</p>
          </EmptyState>
        </Page>
      </Frame>
    );
  }

  return (
    <Frame>
      <Page
        title="AI Usage Overview"
        backAction={{
          content: "Back",
          onAction: () => navigate("/app"),
        }}
        primaryAction={{
          content: "Refresh Data",
          icon: RefreshIcon,
          onAction: () => window.location.reload(),
        }}
      >
        <BlockStack gap="500">
          <Layout>
            <Layout.Section>
              {/* Main Usage Card */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon source={DataPresentationIcon} color="highlight" />
                      <Text as="h3" variant="headingMd">
                        Monthly Query Usage
                      </Text>
                    </InlineStack>
                    <Badge
                      status={usagePercentage < 90 ? "success" : "critical"}
                    >
                      {usagePercentage < 90 ? "Good" : "Near Limit"}
                    </Badge>
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="300">
                    <Box padding="400">
                      <BlockStack gap="400">
                        <Text variant="headingLg" as="h2" alignment="center">
                          {monthlyUsage} / {monthlyQuota} queries used this
                          month
                        </Text>
                        <div>
                          {isClient ? (
                            <ProgressBar
                              progress={usagePercentage}
                              size="large"
                              tone={
                                usagePercentage < 90 ? "success" : "critical"
                              }
                            />
                          ) : (
                            <div
                              style={{
                                height: "8px",
                                backgroundColor: "#e0e0e0",
                                borderRadius: "4px",
                                margin: "12px 0",
                                position: "relative",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  height: "100%",
                                  backgroundColor:
                                    usagePercentage < 90
                                      ? "#008060"
                                      : "#d82c0d",
                                  width: `${usagePercentage}%`,
                                }}
                              ></div>
                            </div>
                          )}
                        </div>
                        <Text variant="bodyMd" as="p" alignment="center">
                          {100 - usagePercentage > 0
                            ? `${(100 - usagePercentage).toFixed(1)}% remaining`
                            : "Quota exceeded"}
                        </Text>
                      </BlockStack>
                    </Box>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Usage Statistics */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon source={ChartVerticalIcon} color="highlight" />
                      <Text as="h3" variant="headingMd">
                        Usage Statistics
                      </Text>
                    </InlineStack>
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="300">
                    <InlineStack gap="200" align="start">
                      <Box width="24px">
                        <Icon source={ChatIcon} color="base" />
                      </Box>
                      <BlockStack gap="0">
                        <InlineStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="bold">
                            Total Queries:
                          </Text>
                          <Text as="p">{websiteData?.totalQueries || 0}</Text>
                        </InlineStack>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="200" align="start">
                      <Box width="24px">
                        <Icon source={RefreshIcon} color="base" />
                      </Box>
                      <BlockStack gap="0">
                        <InlineStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="bold">
                            Reset Date:
                          </Text>
                          <Text as="p">
                            {formatDate(websiteData?.quotaResetDate)}
                          </Text>
                        </InlineStack>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="200" align="start">
                      <Box width="24px">
                        <Icon source={GlobeIcon} color="base" />
                      </Box>
                      <BlockStack gap="0">
                        <InlineStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="bold">
                            Current Plan:
                          </Text>
                          <Badge>{websiteData?.plan || "Basic"}</Badge>
                        </InlineStack>
                      </BlockStack>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* AI Query History */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon source={ChatIcon} color="highlight" />
                      <Text as="h3" variant="headingMd">
                        Recent AI Queries
                      </Text>
                    </InlineStack>
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="300">
                    {aiHistoryData &&
                    aiHistoryData.queries &&
                    aiHistoryData.queries.length > 0 ? (
                      aiHistoryData.queries.slice(0, 5).map((query, index) => (
                        <Box
                          key={index}
                          background="bg-surface-secondary"
                          padding="300"
                          borderRadius="200"
                        >
                          <BlockStack gap="200">
                            <InlineStack align="space-between">
                              <Text variant="bodyMd" fontWeight="bold">
                                {new Date(query.createdAt).toLocaleString()}
                              </Text>
                              <Badge>{query.source || "Web"}</Badge>
                            </InlineStack>
                            <Text variant="bodyMd">Q: {query.query}</Text>
                          </BlockStack>
                        </Box>
                      ))
                    ) : (
                      <Box
                        padding="300"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <Text alignment="center">
                          {aiHistoryError
                            ? "Error loading queries. Next.js API server not available."
                            : "No recent queries available"}
                        </Text>
                      </Box>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Website Overview */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon source={GlobeIcon} color="highlight" />
                      <Text as="h3" variant="headingMd">
                        Website Overview
                      </Text>
                    </InlineStack>
                    <Button onClick={() => navigate("/app/settings")}>
                      Manage Settings
                    </Button>
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="300">
                    <InlineStack gap="200" align="start">
                      <Box width="24px">
                        <Icon source={GlobeIcon} color="base" />
                      </Box>
                      <BlockStack gap="0">
                        <InlineStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="bold">
                            Website:
                          </Text>
                          <Text as="p">{websiteData?.name || "Not set"}</Text>
                        </InlineStack>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="200" align="start">
                      <Box width="24px">
                        <Icon source={GlobeIcon} color="base" />
                      </Box>
                      <BlockStack gap="0">
                        <InlineStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="bold">
                            URL:
                          </Text>
                          <Text as="p">{websiteData?.url || "Not set"}</Text>
                        </InlineStack>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="200" align="start">
                      <Box width="24px">
                        <Icon source={RefreshIcon} color="base" />
                      </Box>
                      <BlockStack gap="0">
                        <InlineStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="bold">
                            Last Synced:
                          </Text>
                          <Text as="p">
                            {websiteData?.lastSyncedAt
                              ? new Date(
                                  websiteData.lastSyncedAt,
                                ).toLocaleString()
                              : "Never"}
                          </Text>
                        </InlineStack>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Box width="24px" />
                      <Button onClick={() => navigate("/app/pricing")}>
                        Upgrade Plan
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>

        {showToast && (
          <Toast
            content={toastMessage}
            tone={toastType}
            onDismiss={toggleToast}
          />
        )}
      </Page>
    </Frame>
  );
}

// Error boundary for this route
export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  let errorMessage = "Unknown error";
  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Frame>
      <Page>
        <EmptyState
          heading="Error loading AI usage data"
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          action={{
            content: "Back to Dashboard",
            onAction: () => navigate("/app"),
          }}
        >
          <p>{errorMessage}</p>
          {error.stack && (
            <details>
              <summary>Error details</summary>
              <pre>{error.stack}</pre>
            </details>
          )}
        </EmptyState>
      </Page>
    </Frame>
  );
}
