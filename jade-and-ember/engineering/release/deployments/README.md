# Deployment authorisation records (G6-2)

One JSON file per decision, schema `jade-and-ember/deployment-record@1`, type `deployment-authorisation`, bound to the candidate digest, to the in-force release approval it relies on (`subject.releaseApproval`) and to the target host (`subject.targetHost`). **This folder holds no record today.** The gate reports a deployment authorisation and nothing acts on it: no tool in this repository deploys. Audit: `npm run release:audit -- deployments`.
