import { KubeConfig, CoreV1Api } from "@kubernetes/client-node";

const kc = new KubeConfig();
kc.loadFromDefault(); // k3d automatically configures this

const k8sApi = kc.makeApiClient(CoreV1Api);

async function testConnection() {
  try {
    console.log("Testing Kubernetes connection...");

    const nodes = await k8sApi.listNode();
    console.log("✅ Connected to Kubernetes!");
    console.log(`Found ${nodes.body.items.length} nodes:`);

    nodes.body.items.forEach((node) => {
      console.log(
        `  - ${node.metadata.name} (${
          node.status.conditions.find((c) => c.type === "Ready")?.status
        })`
      );
    });
  } catch (error) {
    console.error("❌ Failed to connect to Kubernetes:", error.message);
  }
}

testConnection();
