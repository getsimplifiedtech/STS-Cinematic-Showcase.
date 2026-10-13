#!/bin/bash
# Supply-chain report (G6-7): the read-only report of the former inline workflow step, unchanged, now one script that the composite action runs in its
# "supply-chain-report" mode. Run from the engineering folder (the one with package-lock.json). Nothing is installed or written beyond $RUNNER_TEMP, no secret
# is used, and every command that may legitimately report a problem is followed by `|| true` so the job reports and never fails the run.
set -u
echo "node $(node --version), npm $(npm --version)"
echo "--- npm audit signatures (registry signatures and provenance attestations)"
npm audit signatures || echo "npm audit signatures exited with code $?"
echo "--- npm audit (summary)"
npm audit --json > "$RUNNER_TEMP/audit.json" || true
node -e "const a=require(process.env.RUNNER_TEMP+'/audit.json');console.log(JSON.stringify(a.metadata&&a.metadata.vulnerabilities));console.log(Object.entries(a.vulnerabilities||{}).map(([n,v])=>v.severity+' '+n).sort().join('\n'))"
echo "--- SBOM (npm sbom, built into npm)"
npm sbom --sbom-format cyclonedx > "$RUNNER_TEMP/sbom.cdx.json" || true
npm sbom --sbom-format spdx > "$RUNNER_TEMP/sbom.spdx.json" || true
node -e "const fs=require('fs'),t=process.env.RUNNER_TEMP;const c=JSON.parse(fs.readFileSync(t+'/sbom.cdx.json'));const s=JSON.parse(fs.readFileSync(t+'/sbom.spdx.json'));console.log('CycloneDX '+c.specVersion+': '+c.components.length+' components, '+c.components.filter(x=>x.hashes&&x.hashes.length).length+' with hashes, '+c.components.filter(x=>x.licenses&&x.licenses.length).length+' with licences');console.log(s.spdxVersion+': '+s.packages.length+' packages')"
sha256sum "$RUNNER_TEMP/sbom.cdx.json" "$RUNNER_TEMP/sbom.spdx.json"
echo "--- npm outdated (direct dependencies)"
npm outdated || true
echo "--- packages with install scripts, and deprecated packages, in the lockfile"
node -e "const l=require('./package-lock.json').packages;console.log('install scripts:',Object.keys(l).filter(k=>k&&l[k].hasInstallScript).join(', ')||'none');console.log('deprecated:',Object.keys(l).filter(k=>k&&l[k].deprecated).join(', ')||'none')"
