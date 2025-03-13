// API and Service URLs Configuration
const urls = {
  // Shopify URLs
  shopifyCdn: "https://cdn.shopify.com",
  shopifyAdmin: "https://admin.shopify.com",

  // Voicero API URLs
  voiceroApi: "http://localhost:3000",
  newVoiceroApi: "http://localhost:3000",

  // voiceroApi: "https://www.voicero.ai",
  // newVoiceroApi: "https://www.voicero.ai",

  // Training API URLs
  // trainingApiBase: "https://5w985cmyf9.execute-api.us-east-2.amazonaws.com",
  // trainingApiStatus:
  //   "https://5w985cmyf9.execute-api.us-east-2.amazonaws.com/dev/status",
  // trainingApiAuto:
  //   "https://5w985cmyf9.execute-api.us-east-2.amazonaws.com/dev/auto",

  trainingApiBase: "http://localhost:4000",
  trainingApiStatus: "http://localhost:4000/status",
  trainingApiAuto: "http://localhost:4000/auto",
};

export default urls;
