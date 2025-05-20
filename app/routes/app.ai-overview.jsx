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
  EmptyState,
  Icon,
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

    // Extract analysis from response if available - check all possible locations
    console.log("Checking for analysis in data response:", Object.keys(data));

    // Get the analysis from the appropriate location in the response
    // The server logs show a large markdown-formatted analysis string
    let analysis = data.analysis || null;

    // If analysis is still null, try looking for it in another location or use a default
    if (!analysis) {
      console.log(
        "Analysis not found in expected location. Looking elsewhere...",
      );
      // The raw data might be directly in the response
      if (typeof data === "object" && Object.keys(data).length > 0) {
        // Look for any property that might contain the analysis (large string with markdown formatting)
        for (const key of Object.keys(data)) {
          if (
            typeof data[key] === "string" &&
            data[key].includes("###") &&
            data[key].length > 500
          ) {
            console.log(`Found potential analysis in property: ${key}`);
            return json({
              websiteData: data.website,
              aiHistoryData: null, // Will be fetched later
              analysis: data[key],
              accessKey,
              aiHistoryError: false,
            });
          }
        }
      }
    }

    console.log(
      "Final analysis value to use:",
      analysis ? "Found" : "Not found",
    );

    // Now make a second API call to get AI history
    let aiHistoryData = null;
    let aiHistoryError = false;

    try {
      // Get the request URL to build an absolute URL
      const url = new URL(request.url);
      const baseUrl = `${url.protocol}//${url.host}`;

      // Use the correct path that matches our file structure
      const historyResponse = await fetch(`${baseUrl}/api/aiHistory`, {
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
        const historyData = await historyResponse.json();
        console.log("AI History Response:", historyData);

        // Check the shape of the historyData response
        console.log("History data has keys:", Object.keys(historyData));

        // Extract analysis from the aiHistory response - THIS is where the analysis comes from!
        // Make sure we handle the response regardless of its format (threads or analysis directly)
        const analysisFromHistory = historyData.analysis;

        // Check if we have data in the expected format
        aiHistoryData = Array.isArray(historyData)
          ? historyData
          : historyData.threads || historyData.queries || [];

        // If we found analysis in the history response, use that
        if (analysisFromHistory) {
          // Make sure it's a string before assigning
          if (typeof analysisFromHistory === "string") {
            analysis = analysisFromHistory;
            console.log(
              "Found analysis in aiHistory response: " +
                analysisFromHistory.substring(0, 100) +
                "...",
            );
          } else if (typeof analysisFromHistory === "object") {
            // If it's an object, stringify it
            analysis = JSON.stringify(analysisFromHistory);
            console.log("Analysis was an object, stringified it");
          }
        }
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

    // Check one more time if we have an analysis from the response
    const finalAnalysis =
      analysis ||
      "No analysis available from the API. Please check the server logs for more information.";
    console.log(
      "Final analysis before returning:",
      finalAnalysis
        ? typeof finalAnalysis === "string"
          ? finalAnalysis.substring(0, 100) + "..."
          : "Object analysis"
        : "null",
    );

    return json({
      websiteData: data.website,
      aiHistoryData,
      analysis: finalAnalysis,
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

// Simple CSS-only progress bar that doesn't depend on Polaris theme
function CustomProgressBar({ progress, tone = "success" }) {
  const color = tone === "critical" ? "#d82c0d" : "#008060";

  return (
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
          backgroundColor: color,
          width: `${progress}%`,
        }}
      ></div>
    </div>
  );
}

export default function AIOverviewPage() {
  const {
    websiteData,
    aiHistoryData,
    analysis,
    error,
    disconnected,
    aiHistoryError,
  } = useLoaderData();
  const navigate = useNavigate();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");
  const [isLoading, setIsLoading] = useState(true);

  // Helper function to format markdown text with bold, italics, etc.
  const formatMarkdownText = (text) => {
    if (!text) return "";

    // Create parts array to hold strings and JSX elements
    const parts = [];

    // Handle bold text (**text**)
    let lastIndex = 0;
    const boldRegex = /\*\*(.*?)\*\*/g;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      // Add the bold text as JSX
      parts.push(
        <span key={match.index} style={{ fontWeight: "bold" }}>
          {match[1]}
        </span>,
      );

      // Update the lastIndex
      lastIndex = match.index + match[0].length;
    }

    // Add any remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    // If there are no bold parts, just return the original text
    if (parts.length === 0) {
      return text;
    }

    return <>{parts}</>;
  };

  // Redirect if disconnected
  useEffect(() => {
    if (disconnected) {
      navigate("/app");
    }
  }, [disconnected, navigate]);

  // Set loading state based on data availability
  useEffect(() => {
    // When data is available or there's an error, stop loading
    if (aiHistoryData !== null || aiHistoryError) {
      // Short delay to ensure the analysis renders properly
      setTimeout(() => {
        setIsLoading(false);
      }, 500);
    }
  }, [aiHistoryData, aiHistoryError]);

  // Calculate usage percentages - use the correct property names
  const monthlyUsage = websiteData?.monthlyQueries || 0;
  const monthlyQuota = websiteData?.queryLimit || 1000;
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

  // Debug data to console
  useEffect(() => {
    if (websiteData) {
      console.log("WebsiteData in component:", websiteData);
    }
    if (aiHistoryData) {
      console.log("AI History in component:", aiHistoryData);
    }
    console.log("Analysis in component RAW:", analysis);
    // Check if analysis has markdown formatting
    if (typeof analysis === "string") {
      if (analysis.includes("###")) {
        console.log("Analysis appears to be markdown formatted with headings");
      }
      // Log the first 100 chars to see what we're working with
      console.log("Analysis preview: " + analysis.substring(0, 100) + "...");
    } else {
      console.log("Analysis is not a string:", typeof analysis);
    }
  }, [websiteData, aiHistoryData, analysis]);

  const toggleToast = () => setShowToast(!showToast);

  if (disconnected) {
    return null; // Don't render anything while redirecting
  }

  if (error) {
    return (
      <Page>
        <EmptyState
          heading="Unable to load AI usage data"
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          action={{ content: "Back to Dashboard", url: "/app" }}
        >
          <p>{error}</p>
        </EmptyState>
      </Page>
    );
  }

  return (
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
                  <Badge status={usagePercentage < 90 ? "success" : "critical"}>
                    {usagePercentage < 90 ? "Good" : "Near Limit"}
                  </Badge>
                </InlineStack>
                <Divider />
                <BlockStack gap="300">
                  <Box padding="400">
                    <BlockStack gap="400">
                      <Text variant="headingLg" as="h2" alignment="center">
                        {monthlyUsage} / {monthlyQuota} queries used this month
                      </Text>
                      <div>
                        <CustomProgressBar
                          progress={usagePercentage}
                          tone={usagePercentage < 90 ? "success" : "critical"}
                        />
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

            {/* AI Analysis Card */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <InlineStack gap="200">
                    <Icon source={DataPresentationIcon} color="highlight" />
                    <Text as="h3" variant="headingMd">
                      AI Usage Analysis
                    </Text>
                  </InlineStack>
                </InlineStack>
                <Divider />
                <BlockStack gap="300">
                  {isLoading ? (
                    // Loading state
                    <Box padding="400">
                      <BlockStack gap="200">
                        <Text alignment="center">Loading analysis...</Text>
                        <div
                          style={{
                            width: "100%",
                            height: "4px",
                            backgroundColor: "#f5f5f5",
                            borderRadius: "2px",
                            overflow: "hidden",
                            position: "relative",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              width: "30%",
                              height: "100%",
                              backgroundColor: "#008060",
                              borderRadius: "2px",
                              animation: "loading 1.5s infinite ease-in-out",
                              left: "-30%",
                            }}
                          ></div>
                        </div>
                      </BlockStack>
                    </Box>
                  ) : (
                    // Analysis data display - always show something
                    <Box padding="400">
                      <BlockStack gap="300">
                        {typeof analysis === "string" && analysis ? (
                          // Format the string analysis with line breaks and headings
                          <div>
                            {analysis.split("\n").map((line, index) => {
                              // Format headings (lines starting with #)
                              if (line.startsWith("###")) {
                                return (
                                  <Text
                                    key={index}
                                    variant="headingSm"
                                    fontWeight="bold"
                                    as="h4"
                                    padding="300"
                                  >
                                    {line.replace(/^###\s/, "")}
                                  </Text>
                                );
                              } else if (line.startsWith("##")) {
                                return (
                                  <Text
                                    key={index}
                                    variant="headingMd"
                                    fontWeight="bold"
                                    as="h3"
                                    padding="300"
                                  >
                                    {line.replace(/^##\s/, "")}
                                  </Text>
                                );
                              }
                              // Handle table rows
                              else if (line.includes("|")) {
                                // Table header or divider row
                                if (
                                  line.includes("---") ||
                                  line.includes("===")
                                ) {
                                  return null; // Skip table divider rows
                                }
                                // Process table row
                                const cells = line
                                  .split("|")
                                  .filter((cell) => cell.trim());
                                if (cells.length > 0) {
                                  return (
                                    <div
                                      key={index}
                                      style={{
                                        display: "flex",
                                        width: "100%",
                                        marginBottom: "8px",
                                      }}
                                    >
                                      {cells.map((cell, cellIndex) => (
                                        <div
                                          key={cellIndex}
                                          style={{
                                            flex: 1,
                                            padding: "8px 12px",
                                            backgroundColor:
                                              index === 0
                                                ? "#f5f5f5"
                                                : "transparent",
                                            fontWeight:
                                              index === 0 ? "bold" : "normal",
                                            borderBottom: "1px solid #e1e3e5",
                                          }}
                                        >
                                          <Text variant="bodyMd">
                                            {formatMarkdownText(cell.trim())}
                                          </Text>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                }
                                return null;
                              }
                              // Format list items
                              else if (line.match(/^-\s/)) {
                                return (
                                  <Text
                                    key={index}
                                    variant="bodyMd"
                                    as="p"
                                    padding="100"
                                    paddingInlineStart="400"
                                  >
                                    •{" "}
                                    {formatMarkdownText(
                                      line.replace(/^-\s/, ""),
                                    )}
                                  </Text>
                                );
                              }
                              // Format numbered list items
                              else if (line.match(/^\d+\.\s/)) {
                                return (
                                  <Text
                                    key={index}
                                    variant="bodyMd"
                                    as="p"
                                    padding="100"
                                    paddingInlineStart="400"
                                  >
                                    {formatMarkdownText(line)}
                                  </Text>
                                );
                              }
                              // Skip empty lines or separators
                              else if (
                                line.trim() === "" ||
                                line.trim() === "---"
                              ) {
                                return (
                                  <div key={index} style={{ height: "16px" }} />
                                );
                              }
                              // Regular text
                              else {
                                return (
                                  <Text
                                    key={index}
                                    variant="bodyMd"
                                    as="p"
                                    padding="100"
                                  >
                                    {formatMarkdownText(line)}
                                  </Text>
                                );
                              }
                            })}
                          </div>
                        ) : analysis && typeof analysis === "object" ? (
                          // Handle if analysis is an object with multiple properties
                          Object.entries(analysis).map(([key, value]) => (
                            <BlockStack key={key} gap="100">
                              <Text variant="bodyMd" fontWeight="bold">
                                {key.charAt(0).toUpperCase() +
                                  key.slice(1).replace(/([A-Z])/g, " $1")}
                                :
                              </Text>
                              <Text variant="bodyMd">{value}</Text>
                            </BlockStack>
                          ))
                        ) : (
                          // Fallback if no analysis data
                          <Text alignment="center">
                            No analysis data available for your current usage.
                          </Text>
                        )}
                      </BlockStack>
                    </Box>
                  )}
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
                        <Text as="p">{websiteData?.monthlyQueries || 0}</Text>
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
                  {isLoading ? (
                    // Loading state
                    <Box
                      padding="300"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <BlockStack gap="200">
                        <InlineStack align="center">
                          <Text alignment="center">
                            Loading recent AI queries...
                          </Text>
                        </InlineStack>
                        <div
                          style={{
                            width: "100%",
                            height: "4px",
                            backgroundColor: "#f5f5f5",
                            borderRadius: "2px",
                            overflow: "hidden",
                            position: "relative",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              width: "30%",
                              height: "100%",
                              backgroundColor: "#008060",
                              borderRadius: "2px",
                              animation: "loading 1.5s infinite ease-in-out",
                              left: "-30%",
                            }}
                          ></div>
                        </div>
                        <style>{`
                          @keyframes loading {
                            0% { transform: translateX(0); }
                            100% { transform: translateX(433%); }
                          }
                        `}</style>
                      </BlockStack>
                    </Box>
                  ) : aiHistoryData && aiHistoryData.length > 0 ? (
                    // Data loaded successfully
                    <>
                      {aiHistoryData
                        .slice(0, 10) // Show top 10 threads
                        .map((thread, index) => {
                          // Find first user message for the query text
                          const firstUserMessage =
                            thread.messages && thread.messages.length > 0
                              ? thread.messages.find(
                                  (msg) => msg.role === "user",
                                )
                              : null;

                          const queryText = firstUserMessage
                            ? firstUserMessage.content
                            : thread.initialQuery || "Untitled conversation";

                          return (
                            <Box
                              key={index}
                              background="bg-surface-secondary"
                              padding="300"
                              borderRadius="200"
                            >
                              {/* Simplified single-line layout */}
                              <InlineStack align="space-between">
                                <BlockStack gap="0">
                                  <Text variant="bodyMd" fontWeight="semibold">
                                    {queryText}
                                  </Text>
                                  <Text variant="bodySm" color="subdued">
                                    {new Date(
                                      thread.lastMessageAt,
                                    ).toLocaleDateString()}{" "}
                                    {new Date(
                                      thread.lastMessageAt,
                                    ).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </Text>
                                </BlockStack>
                                <InlineStack gap="200" align="center">
                                  <Badge>
                                    {thread.messageCount > 0
                                      ? `${thread.messageCount} messages`
                                      : "New"}
                                  </Badge>
                                  <Button
                                    size="slim"
                                    url={`https://www.voicero.ai/app/chats/session?id=${thread.id}`}
                                    external={true}
                                  >
                                    View More
                                  </Button>
                                </InlineStack>
                              </InlineStack>
                            </Box>
                          );
                        })}

                      {/* View All button at the bottom - always show it */}
                      <Box paddingBlock="300">
                        <InlineStack align="center">
                          <Button
                            url="https://www.voicero.ai/app/chats"
                            external={true}
                          >
                            View All Conversations
                          </Button>
                        </InlineStack>
                      </Box>
                    </>
                  ) : (
                    // No data available
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
  );
}
