import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  InlineStack,
  Box,
  Link,
  Divider,
  Icon,
  Badge,
} from "@shopify/polaris";
import {
  HomeIcon,
  ExternalIcon,
  PageIcon,
  BlogIcon,
  ProductIcon,
  CalendarIcon,
  SettingsFilledIcon,
  DiscountIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

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
    // Redirect to main page if no access key found
    return json({
      disconnected: true,
    });
  }

  try {
    // Fetch website data
    const response = await fetch("http://localhost:3000/api/connect", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch website data");
    }

    const data = await response.json();
    return json({ websiteData: data.website });
  } catch (error) {
    return json({
      error: error.message || "Failed to fetch website data",
    });
  }
};

// Simplified action - removed sync functionality
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

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
  const accessKey = metafieldData.data.shop.metafield?.value;

  if (!accessKey) {
    return json({
      success: false,
      error: "Access key not found",
    });
  }

  // All sync-related functionality removed
  return json({ success: false, error: "No actions implemented" });
};

export default function WebsitePage() {
  const { websiteData, error, disconnected } = useLoaderData();
  const navigate = useNavigate();

  // Redirect if disconnected
  useEffect(() => {
    if (disconnected) {
      console.log(
        "Website page detected disconnected state, redirecting to main",
      );
      navigate("/app");
    }
  }, [disconnected, navigate]);

  if (disconnected) {
    return null; // Don't render anything while redirecting
  }

  if (error) {
    return (
      <Page>
        <Banner status="critical">
          <p>{error}</p>
        </Banner>
      </Page>
    );
  }

  const formattedLastSync = websiteData.lastSyncedAt
    ? new Date(websiteData.lastSyncedAt).toLocaleString()
    : "Never";

  const getStatusBadge = (date) => {
    if (!date) return <Badge status="attention">Never synced</Badge>;

    const lastSync = new Date(date);
    const now = new Date();
    const daysDiff = Math.floor((now - lastSync) / (1000 * 60 * 60 * 24));

    if (daysDiff < 1) return <Badge status="success">Recent</Badge>;
    if (daysDiff < 7) return <Badge status="info">This week</Badge>;
    return <Badge status="warning">Outdated</Badge>;
  };

  return (
    <Page
      title="Website Management"
      backAction={{
        content: "Back",
        onAction: () => navigate("/app"),
      }}
      primaryAction={{
        content: "Go to Shopify Admin",
        icon: ExternalIcon,
        onAction: () => {
          window.open("https://admin.shopify.com", "_blank");
        },
      }}
    >
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            {/* Dashboard Summary Card */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h3" variant="headingMd">
                    Website Dashboard
                  </Text>
                  <Link url="/app" removeUnderline monochrome>
                    <InlineStack gap="200" blockAlign="center">
                      <Icon source={HomeIcon} color="highlight" />
                      <Text variant="bodyMd">Dashboard Home</Text>
                    </InlineStack>
                  </Link>
                </InlineStack>
                <Divider />
                <BlockStack gap="400">
                  <Text as="p" variant="bodyMd" color="subdued">
                    Your website content status and AI assistant settings are
                    summarized below.
                  </Text>

                  <Box paddingBlockStart="300" paddingBlockEnd="300">
                    <BlockStack gap="400">
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr 1fr",
                          gap: "16px",
                        }}
                      >
                        <Card padding="300">
                          <BlockStack gap="100" align="center">
                            <Icon source={PageIcon} color="primary" />
                            <Text
                              variant="headingXl"
                              fontWeight="bold"
                              alignment="center"
                            >
                              {websiteData._count.pages}
                            </Text>
                            <Text
                              variant="bodySm"
                              color="subdued"
                              alignment="center"
                            >
                              Pages
                            </Text>
                          </BlockStack>
                        </Card>

                        <Card padding="300">
                          <BlockStack gap="100" align="center">
                            <Icon source={BlogIcon} color="primary" />
                            <Text
                              variant="headingXl"
                              fontWeight="bold"
                              alignment="center"
                            >
                              {websiteData._count.posts}
                            </Text>
                            <Text
                              variant="bodySm"
                              color="subdued"
                              alignment="center"
                            >
                              Posts
                            </Text>
                          </BlockStack>
                        </Card>

                        <Card padding="300">
                          <BlockStack gap="100" align="center">
                            <Icon source={ProductIcon} color="primary" />
                            <Text
                              variant="headingXl"
                              fontWeight="bold"
                              alignment="center"
                            >
                              {websiteData._count.products}
                            </Text>
                            <Text
                              variant="bodySm"
                              color="subdued"
                              alignment="center"
                            >
                              Products
                            </Text>
                          </BlockStack>
                        </Card>

                        {/* Add discounts card inline with others */}
                        <Card padding="300">
                          <BlockStack gap="100" align="center">
                            <Icon source={DiscountIcon} color="primary" />
                            <Text
                              variant="headingXl"
                              fontWeight="bold"
                              alignment="center"
                            >
                              {websiteData._count.discounts || 0}
                            </Text>
                            <Text
                              variant="bodySm"
                              color="subdued"
                              alignment="center"
                            >
                              Discounts
                            </Text>
                          </BlockStack>
                        </Card>
                      </div>
                    </BlockStack>
                  </Box>

                  {/* Last Content Update display */}
                  <Box paddingBlockStart="400" paddingBlockEnd="400">
                    <Card>
                      <Box padding="400">
                        <InlineStack align="space-between">
                          <InlineStack gap="300" blockAlign="center">
                            <Icon source={CalendarIcon} color="primary" />
                            <Text variant="bodyMd" fontWeight="semibold">
                              Last Content Update:
                            </Text>
                            <Text variant="bodyMd">{formattedLastSync}</Text>
                          </InlineStack>
                          {getStatusBadge(websiteData.lastSyncedAt)}
                        </InlineStack>
                      </Box>
                    </Card>
                  </Box>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* AI Assistant Settings Card */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <InlineStack gap="200">
                    <Icon source={SettingsFilledIcon} color="primary" />
                    <Text as="h3" variant="headingMd">
                      AI Assistant Settings
                    </Text>
                  </InlineStack>
                  <Button
                    external
                    onClick={() => {
                      window.open(
                        `http://localhost:3000/app/websites/website?id=${websiteData.id}#settings`,
                        "_blank",
                      );
                    }}
                    primary
                  >
                    Edit Settings
                  </Button>
                </InlineStack>
                <Divider />
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="bold">
                      Custom Instructions:
                    </Text>
                    <Card background="bg-surface-secondary">
                      <Text as="p">
                        {websiteData.customInstructions ||
                          "No custom instructions set"}
                      </Text>
                    </Card>
                  </BlockStack>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="bold">
                      Pop-up Questions:
                    </Text>
                    {websiteData.popUpQuestions?.length > 0 ? (
                      <BlockStack gap="200">
                        {websiteData.popUpQuestions.map((question, index) => (
                          <Card background="bg-surface-secondary" key={index}>
                            <Text as="p">
                              {question.question ||
                                question.text ||
                                question.content ||
                                JSON.stringify(question)}
                            </Text>
                          </Card>
                        ))}
                      </BlockStack>
                    ) : (
                      <Card background="bg-surface-secondary">
                        <Text as="p">No pop-up questions configured</Text>
                      </Card>
                    )}
                  </BlockStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
