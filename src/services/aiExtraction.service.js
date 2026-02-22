const axios = require("axios");

const extractPrescription = async (filePath) => {
  const response = await axios.post(
    process.env.AI_EXTRACTION_URL,
    { filePath },
    { timeout: 15000 },
  );

  return response.data;
};

module.exports = { extractPrescription };
