import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  TextField,
  InlineStack,
  Modal,
  Icon,
  Box,
  Badge,
  Divider,
  Toast,
  Frame,
  ProgressBar,
  Tooltip,
  EmptyState,
} from "@shopify/polaris";
import {
  KeyIcon,
  ExitIcon,
  GlobeIcon,
  EditIcon,
  QuestionCircleIcon,
  ToggleOnIcon,
  ToggleOffIcon,
  PlusIcon,
  DeleteIcon,
  CreditCardCancelIcon,
  SaveIcon,
  SettingsIcon,
  CalendarIcon,
  RefreshIcon,
  CreditCardIcon,
  InfoIcon,
  CheckIcon,
  DataPresentationIcon,
  ChartVerticalIcon,
  MobileIcon,
  DesktopIcon,
  ChatIcon,
  XIcon,
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
    return json({
      disconnected: true,
      error: "No access key found",
    });
  }

  try {
    // Fetch website data from the connect API
    const response = await fetch("http://localhost:3000/api/connect", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    });

    if (!response.ok) {
      // If the access key is invalid or there's no website, redirect to connect
      return json({
        disconnected: true,
        error: "Invalid access key or no website found",
      });
    }

    const data = await response.json();
    if (!data.website) {
      return json({
        disconnected: true,
        error: "No website data found",
      });
    }

    return json({
      websiteData: data.website,
      accessKey,
    });
  } catch (error) {
    return json({
      disconnected: true,
      error: error.message || "Failed to fetch website data",
    });
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  // Get access key from metafields
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
  const accessKey = metafieldData.data.shop.metafield?.value;
  const metafieldId = metafieldData.data.shop.metafield?.id;

  if (!accessKey && action !== "disconnect") {
    return json({
      success: false,
      error: "Access key not found",
    });
  }

  try {
    if (action === "update") {
      // Parse the form data
      const popUpQuestions = JSON.parse(formData.get("popUpQuestions") || "[]");
      const active = formData.get("active") === "true";
      const name = formData.get("name");
      const url = formData.get("url");
      const customInstructions = formData.get("customInstructions");

      // Prepare the update payload
      const updates = {
        name,
        url,
        customInstructions,
        popUpQuestions,
        active,
      };

      // Call the editInfoFromShopify API
      const response = await fetch(
        "http://localhost:3000/api/shopify/editInfoFromShopify",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
          body: JSON.stringify(updates),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update settings");
      }

      const data = await response.json();
      return json({
        success: true,
        data: data.website,
        message: "Settings updated successfully!",
      });
    } else if (action === "disconnect") {
      // Use our API endpoint to delete the access key
      try {
        // Get the URL origin from the current request
        const url = new URL(request.url);
        const baseUrl = url.origin;

        // Use a fully qualified URL for server-side fetch with proper error handling
        const response = await fetch(`${baseUrl}/api/accessKey`, {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        });

        await response.json();
      } catch (error) {
        // Continue with disconnect process even if API call fails
      }

      return json({
        success: true,
        disconnected: true,
        message: "Successfully disconnected from VoiceroAI",
      });
    }
  } catch (error) {
    return json({
      success: false,
      error: error.message || "Operation failed",
    });
  }
};

export default function SettingsPage() {
  const { websiteData, accessKey, error, disconnected } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: websiteData?.name || "",
    url: websiteData?.url || "",
    customInstructions: websiteData?.customInstructions || "",
    popUpQuestions: websiteData?.popUpQuestions || [],
    active: websiteData?.active || false,
  });

  const [isEditingQuestions, setIsEditingQuestions] = useState(false);
  const [questions, setQuestions] = useState(websiteData?.popUpQuestions || []);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  // Redirect if disconnected
  useEffect(() => {
    if (disconnected) {
      navigate("/app");
    }
  }, [disconnected, navigate]);

  const handleSave = () => {
    // Create a copy of formData without including lastSyncedAt
    const dataToSubmit = {
      action: "update",
      name: formData.name,
      url: formData.url,
      customInstructions: formData.customInstructions,
      popUpQuestions: JSON.stringify(formData.popUpQuestions),
      active: formData.active.toString(),
      // Explicitly exclude lastSyncedAt to preserve its value on the server
    };

    fetcher.submit(dataToSubmit, { method: "POST" });
    setIsEditing(false);
    setIsEditingQuestions(false);
    setShowToast(true);
    setToastMessage("Settings updated successfully!");
    setToastType("success");
  };

  const toggleStatus = async () => {
    try {
      // Call the toggle-status API
      const response = await fetch(
        "http://localhost:3000/api/websites/toggle-status",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
          body: JSON.stringify({ accessKey }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to toggle status");
      }

      const data = await response.json();

      // Update the local state based on the response
      setFormData({
        ...formData,
        active: data.status === "active",
      });

      setShowToast(true);
      setToastMessage(
        `AI Assistant ${data.status === "active" ? "activated" : "deactivated"} successfully!`,
      );
      setToastType("success");
    } catch (error) {
      console.error("Error toggling status:", error);
      setShowToast(true);
      setToastMessage(error.message || "Failed to toggle status");
      setToastType("critical");
    }
  };

  const handleDisconnect = () => {
    setShowDisconnectModal(false);

    fetch("/api/accessKey", {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          return { success: false, error: "HTTP error" };
        }
        return response.json().catch(() => ({
          success: false,
          error: "JSON parse error",
        }));
      })
      .finally(() => {
        fetcher.submit({ action: "disconnect" }, { method: "POST" });
        setTimeout(() => {
          navigate("/app");
        }, 2000);
      });
  };

  // Redirect to home if disconnected
  useEffect(() => {
    if (fetcher.data?.disconnected) {
      navigate("/app");
    } else if (fetcher.data?.error) {
      setShowToast(true);
      setToastMessage(fetcher.data.error);
      setToastType("critical");
    } else if (fetcher.data?.success) {
      // Update form data with the new data from the server
      if (fetcher.data.data) {
        setFormData({
          name: fetcher.data.data.name || "",
          url: fetcher.data.data.url || "",
          customInstructions: fetcher.data.data.customInstructions || "",
          popUpQuestions: fetcher.data.data.popUpQuestions || [],
          active: fetcher.data.data.active || false,
        });
        setQuestions(fetcher.data.data.popUpQuestions || []);
      }

      setShowToast(true);
      setToastMessage(
        fetcher.data.message || "Operation completed successfully",
      );
      setToastType("success");
    }
  }, [fetcher.data, navigate]);

  const toggleToast = () => setShowToast(!showToast);

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

  return (
    <Frame>
      <Page
        title="Website Settings"
        backAction={{
          content: "Back",
          onAction: () => navigate("/app"),
        }}
        titleMetadata={
          <Badge status={websiteData?.active ? "success" : "critical"}>
            {websiteData?.active ? "Active" : "Inactive"}
          </Badge>
        }
      >
        <BlockStack gap="500">
          <Layout>
            <Layout.Section>
              {/* Connection Settings */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon source={KeyIcon} color="highlight" />
                      <Text as="h3" variant="headingMd">
                        Connection Settings
                      </Text>
                    </InlineStack>
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="300">
                    <InlineStack gap="200" align="start">
                      <Box width="24px">
                        <Icon source={KeyIcon} color="highlight" />
                      </Box>
                      <BlockStack gap="0">
                        <InlineStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="bold">
                            Access Key:
                          </Text>
                          <Box
                            background="bg-surface-secondary"
                            padding="200"
                            borderRadius="100"
                          >
                            <Text as="p" variant="bodyMd">
                              {accessKey}
                            </Text>
                          </Box>
                        </InlineStack>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Box width="24px" />
                      <Button
                        destructive
                        icon={ExitIcon}
                        onClick={() => setShowDisconnectModal(true)}
                      >
                        Disconnect Website
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Website Information */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon source={GlobeIcon} color="highlight" />
                      <Text as="h3" variant="headingMd">
                        Website Information
                      </Text>
                    </InlineStack>
                    {isEditing ? (
                      <InlineStack gap="200">
                        <Button
                          icon={CreditCardCancelIcon}
                          onClick={() => setIsEditing(false)}
                        >
                          Cancel
                        </Button>
                        <Button primary icon={SaveIcon} onClick={handleSave}>
                          Save Changes
                        </Button>
                      </InlineStack>
                    ) : (
                      <Button
                        icon={EditIcon}
                        onClick={() => setIsEditing(true)}
                      >
                        Edit
                      </Button>
                    )}
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="300">
                    <TextField
                      label="Website Name"
                      value={formData.name}
                      onChange={(value) =>
                        setFormData({ ...formData, name: value })
                      }
                      disabled={!isEditing}
                      prefix={<Icon source={GlobeIcon} color="highlight" />}
                    />
                    <TextField
                      label="Website URL"
                      value={formData.url}
                      onChange={(value) =>
                        setFormData({ ...formData, url: value })
                      }
                      disabled={!isEditing}
                      prefix={<Icon source={GlobeIcon} color="highlight" />}
                    />
                    <TextField
                      label="Custom Instructions"
                      value={formData.customInstructions}
                      onChange={(value) =>
                        setFormData({ ...formData, customInstructions: value })
                      }
                      multiline={4}
                      disabled={!isEditing}
                      helpText="Provide custom instructions for your AI assistant to better serve your customers"
                    />
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* AI Assistant Configuration */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon source={SettingsIcon} color="highlight" />
                      <Text as="h3" variant="headingMd">
                        AI Assistant Configuration
                      </Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Button
                        icon={formData.active ? ToggleOffIcon : ToggleOnIcon}
                        onClick={toggleStatus}
                        primary
                      >
                        {formData.active ? "Deactivate" : "Activate"}
                      </Button>
                      {isEditingQuestions ? (
                        <InlineStack gap="200">
                          <Button
                            icon={XIcon}
                            onClick={() => {
                              setIsEditingQuestions(false);
                              setQuestions(websiteData?.popUpQuestions || []);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            primary
                            icon={SaveIcon}
                            onClick={() => {
                              const updatedFormData = {
                                ...formData,
                                popUpQuestions: questions,
                              };
                              setFormData(updatedFormData);
                              setIsEditingQuestions(false);

                              // Submit the updated form data
                              fetcher.submit(
                                {
                                  action: "update",
                                  ...updatedFormData,
                                  popUpQuestions: JSON.stringify(questions),
                                  active: updatedFormData.active.toString(),
                                },
                                { method: "POST" },
                              );

                              setShowToast(true);
                              setToastMessage(
                                "Questions updated successfully!",
                              );
                              setToastType("success");
                            }}
                          >
                            Save Questions
                          </Button>
                        </InlineStack>
                      ) : (
                        <Button
                          icon={EditIcon}
                          onClick={() => setIsEditingQuestions(true)}
                          primary
                        >
                          Edit Questions
                        </Button>
                      )}
                    </InlineStack>
                  </InlineStack>
                  <Divider />

                  <BlockStack gap="300">
                    <InlineStack gap="200" align="start">
                      <Box width="24px">
                        <Icon
                          source={formData.active ? CheckIcon : XIcon}
                          color="base"
                        />
                      </Box>
                      <BlockStack gap="0">
                        <InlineStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="bold">
                            Status:
                          </Text>
                          <Badge
                            tone={formData.active ? "success" : "critical"}
                            icon={formData.active ? CheckIcon : XIcon}
                          >
                            {formData.active ? "Active" : "Inactive"}
                          </Badge>
                        </InlineStack>
                      </BlockStack>
                    </InlineStack>

                    <BlockStack gap="200">
                      <InlineStack gap="200" align="start">
                        <Box width="24px">
                          <Icon source={QuestionCircleIcon} color="base" />
                        </Box>
                        <BlockStack gap="200" width="100%">
                          <Text as="p" variant="bodyMd" fontWeight="bold">
                            Pop-up Questions:
                          </Text>
                          {isEditingQuestions ? (
                            <BlockStack gap="300">
                              {questions.map((question, index) => (
                                <InlineStack
                                  key={index}
                                  align="space-between"
                                  gap="200"
                                >
                                  <TextField
                                    label={`Question ${index + 1}`}
                                    value={question.question}
                                    onChange={(value) => {
                                      const newQuestions = [...questions];
                                      newQuestions[index] = {
                                        ...question,
                                        question: value,
                                      };
                                      setQuestions(newQuestions);
                                    }}
                                    labelHidden
                                    prefix={
                                      <Text variant="bodyMd">{index + 1}.</Text>
                                    }
                                  />
                                  <Button
                                    tone="critical"
                                    icon={DeleteIcon}
                                    onClick={() => {
                                      const newQuestions = questions.filter(
                                        (_, i) => i !== index,
                                      );
                                      setQuestions(newQuestions);
                                    }}
                                  >
                                    Remove
                                  </Button>
                                </InlineStack>
                              ))}
                              <Button
                                icon={PlusIcon}
                                onClick={() => {
                                  setQuestions([
                                    ...questions,
                                    { question: "" },
                                  ]);
                                }}
                              >
                                Add Question
                              </Button>
                            </BlockStack>
                          ) : (
                            <BlockStack gap="200">
                              {formData.popUpQuestions.length > 0 ? (
                                formData.popUpQuestions.map(
                                  (question, index) => (
                                    <Box
                                      key={index}
                                      background="bg-surface-secondary"
                                      padding="300"
                                      borderRadius="200"
                                    >
                                      <InlineStack gap="200">
                                        <Text as="span" fontWeight="bold">
                                          {index + 1}.
                                        </Text>
                                        <Text as="p">{question.question}</Text>
                                      </InlineStack>
                                    </Box>
                                  ),
                                )
                              ) : (
                                <Box
                                  background="bg-surface-secondary"
                                  padding="300"
                                  borderRadius="200"
                                >
                                  <Text as="p" alignment="center">
                                    No pop-up questions configured
                                  </Text>
                                </Box>
                              )}
                            </BlockStack>
                          )}
                        </BlockStack>
                      </InlineStack>
                    </BlockStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Subscription Information */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon source={CreditCardIcon} color="base" />
                      <Text as="h3" variant="headingMd">
                        Subscription Information
                      </Text>
                    </InlineStack>
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="300">
                    <InlineStack gap="200" align="start">
                      <Box width="24px">
                        <Icon source={InfoIcon} color="base" />
                      </Box>
                      <BlockStack gap="0">
                        <InlineStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="bold">
                            Current Plan:
                          </Text>
                          <Badge>{websiteData.plan || "Basic"}</Badge>
                        </InlineStack>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="200" align="start">
                      <Box width="24px">
                        <Icon source={CalendarIcon} color="base" />
                      </Box>
                      <BlockStack gap="0">
                        <InlineStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="bold">
                            Renews On:
                          </Text>
                          <Text as="p">
                            {websiteData.renewsOn
                              ? new Date(
                                  websiteData.renewsOn,
                                ).toLocaleDateString()
                              : "N/A"}
                          </Text>
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
                            {websiteData.lastSyncedAt
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
                      <Button
                        icon={CreditCardIcon}
                        onClick={() => navigate("/app/pricing")}
                      >
                        Manage Subscription
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

        <Modal
          open={showDisconnectModal}
          onClose={() => setShowDisconnectModal(false)}
          title="Disconnect Website"
          primaryAction={{
            content: "Disconnect",
            destructive: true,
            onAction: handleDisconnect,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setShowDisconnectModal(false),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Text as="p">
                Are you sure you want to disconnect your website from VoiceroAI?
              </Text>
              <Text as="p" tone="critical">
                This action cannot be undone. You will need to reconnect your
                website if you want to use VoiceroAI again.
              </Text>
            </BlockStack>
          </Modal.Section>
        </Modal>
      </Page>
    </Frame>
  );
}
