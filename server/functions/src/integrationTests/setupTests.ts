import { initializeApp } from "firebase-admin";

// TODO: Will need to make sure this code runs
if (process.env.INTEGRATION_TEST_ENABLED === "true") {
  let firebaseConfig: object;
  try {
    firebaseConfig = require("./firebaseConfig.json");
  } catch (_e) {
    firebaseConfig = {};
  }
  initializeApp(firebaseConfig);
}
