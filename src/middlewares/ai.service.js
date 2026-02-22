const fetch = require("node-fetch");

const TEAMMATE_AI_SERVICE_URL = process.env.AI_SERVICE_URL;

const callAIScheduleService = async (patientMeds, prompt) => {
  const response = await fetch(TEAMMATE_AI_SERVICE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientMeds, userPrompt: prompt }),
  });

  if (!response.ok) {
    throw new Error("Teammate AI service failed");
  }

  return await response.json();
};

module.exports = { callAIScheduleService };
