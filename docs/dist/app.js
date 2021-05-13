import {InteractionType} from "../web_modules/@azure/msal-browser.js";
import {AuthenticatedTemplate, UnauthenticatedTemplate, useIsAuthenticated, useMsal, useMsalAuthentication} from "../web_modules/@azure/msal-react.js";
import swc from "../web_modules/@microsoft/sarif-web-component.js";
import {Button} from "../web_modules/azure-devops-ui/Button.js";
import {Spinner} from "../web_modules/azure-devops-ui/Spinner.js";
import React, {useEffect, useState} from "../web_modules/react.js";
import {useHistoryState} from "./useHistoryState.js";
const readAsText = (file) => new Promise((resolve, reject) => {
  let reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsText(file);
});
function tryURL(url) {
  if (!url.startsWith("http"))
    return void 0;
  try {
    return new URL(url);
  } catch (_) {
  }
  return void 0;
}
function asAzureFileContentsUrl(url) {
  if (url.hostname !== "dev.azure.com")
    return void 0;
  if (!url.searchParams.has("version"))
    return void 0;
  const [_empty, organization, project, _git, repository] = url.pathname.split("/");
  const path = encodeURIComponent(url.searchParams.get("path") ?? "");
  const commitOrBranch = url.searchParams.get("version").replace("GB", "").replace("GC", "");
  return new URL(`https://dev.azure.com/${organization}/${project}/_apis/sourceProviders/tfsgit/filecontents?repository=${repository}&path=${path}&commitOrBranch=${commitOrBranch}&api-version=5.0-preview.1`);
}
const params = new URLSearchParams(window.location.search);
const {Viewer} = swc;
export function App() {
  const isAuthenticated = useIsAuthenticated();
  const {instance, accounts} = useMsal();
  const {login} = useMsalAuthentication(InteractionType.Silent, {scopes: []});
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeAfterAuthenticated, setAnalyzeAfterAuthenticated] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileContents, setFileContents] = useState(params.get("fileContents") ?? "");
  const [sarif, setSarif] = useHistoryState();
  useEffect(() => {
    const url = tryURL(fileContents);
    const fileName2 = url?.hostname === "dev.azure.com" && url?.searchParams.get("path")?.split("/").pop() || url?.pathname.split("/").pop();
    if (fileName2)
      setFileName(fileName2);
  }, [fileContents]);
  async function analyze() {
    setAnalyzing(true);
    const intervalID = setInterval(() => console.log("waiting..."), 5e3);
    const url = tryURL(fileContents);
    let urlFileName = void 0;
    let urlContent = void 0;
    try {
      const headers2 = new Headers();
      if (!url)
        throw new Error("URL is empty");
      if (url.href.startsWith("https://sarif-standard.github.io/1esnightlyscan"))
        throw new Error("Temporary skip Nightly Scan.");
      if (url.hostname === "dev.azure.com") {
        const {accessToken} = await instance.acquireTokenSilent({
          account: instance.getAllAccounts()[0],
          scopes: ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"]
        });
        headers2.set("Authorization", `Bearer ${accessToken}`);
      }
      const urlResponse = await fetch(asAzureFileContentsUrl(url)?.toString() ?? url.toString(), {headers: headers2});
      const contentType = urlResponse.headers.get("Content-Type");
      if (contentType?.startsWith("application/json;") && !url.pathname.match(/\.json$/i)) {
        url.pathname += ".json";
      }
      urlFileName = url.pathname.split("/").pop();
      urlContent = await urlResponse.text();
    } catch (_) {
    }
    const headers = new Headers();
    if (isAuthenticated) {
      const tokenResponse = await instance.acquireTokenSilent({
        account: instance.getAllAccounts()[0],
        scopes: ["api://f42dbafe-6e53-4dce-b025-cc4df39fb5cc/Ruleset.read"]
      });
      headers.append("Authorization", `Bearer ${tokenResponse.accessToken}`);
    }
    const body = new FormData();
    body.append("filename", urlFileName ?? fileName);
    body.append("filecontent", urlContent ?? fileContents);
    try {
      const response = await fetch("https://sarif-pattern-matcher-internal-function.azurewebsites.net/api/analyze", {method: "POST", headers, body});
      const responseJson = await response.json();
      if (url?.hostname === "dev.azure.com") {
        responseJson?.runs?.forEach((run) => {
          run.results?.forEach((result) => {
            result.locations?.forEach((location) => {
              const region = location.physicalLocation?.region;
              const artifactLocation = location.physicalLocation?.artifactLocation;
              if (artifactLocation) {
                const urlWithRegion = new URL(url.toString());
                if (region) {
                  function setOrDelete(params2, key, value) {
                    if (value === void 0 || Number.isNaN(value)) {
                      params2.delete(key);
                    } else {
                      params2.set(key, `${value}`);
                    }
                  }
                  setOrDelete(urlWithRegion.searchParams, "line", region.startLine);
                  setOrDelete(urlWithRegion.searchParams, "lineEnd", region.endLine);
                  setOrDelete(urlWithRegion.searchParams, "lineStartColumn", region.startColumn);
                  setOrDelete(urlWithRegion.searchParams, "lineEndColumn", region.endColumn);
                }
                artifactLocation.properties = artifactLocation.properties ?? {};
                artifactLocation.properties["href"] = urlWithRegion.toString();
              }
            });
          });
        });
      }
      setFileName("");
      setFileContents("");
      setSarif(responseJson);
    } catch (error) {
      alert(error);
    }
    clearInterval(intervalID);
    setAnalyzing(false);
  }
  const handleMessage = (event) => {
    if (typeof event.data !== "string")
      return;
    const validOrigins = [
      "http://localhost:8080",
      "https://sarif-standard.github.io"
    ];
    if (!validOrigins.includes(event.origin))
      return;
    setFileContents(event.data);
    setAnalyzeAfterAuthenticated(true);
  };
  useEffect(() => {
    addEventListener("message", handleMessage);
    return () => removeEventListener("message", handleMessage);
  });
  if (analyzeAfterAuthenticated && isAuthenticated) {
    setAnalyzeAfterAuthenticated(false);
    analyze();
  }
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(UnauthenticatedTemplate, null, /* @__PURE__ */ React.createElement("div", {
    className: "center"
  }, /* @__PURE__ */ React.createElement(Button, {
    primary: true,
    onClick: () => login(InteractionType.Popup, {scopes: []})
  }, "Sign in"))), /* @__PURE__ */ React.createElement(AuthenticatedTemplate, null, /* @__PURE__ */ React.createElement("div", {
    className: "intro"
  }, /* @__PURE__ */ React.createElement("div", {
    className: "introHeader"
  }, /* @__PURE__ */ React.createElement("h1", null, document.title), analyzing && /* @__PURE__ */ React.createElement(Spinner, null), !sarif ? /* @__PURE__ */ React.createElement(Button, {
    className: "buttonAnalyze",
    primary: true,
    disabled: !isAuthenticated || !fileContents || analyzing,
    onClick: analyze
  }, "Analyze ", fileName) : /* @__PURE__ */ React.createElement(Button, {
    className: "buttonAnalyze",
    onClick: async () => history.back()
  }, "Clear"), /* @__PURE__ */ React.createElement(Button, {
    onClick: () => instance.logout()
  }, "Sign out ", accounts[0]?.username)), /* @__PURE__ */ React.createElement("textarea", {
    value: fileContents,
    spellCheck: "false",
    autoComplete: "off",
    onChange: (e) => setFileContents(e.target.value),
    onDragOver: (e) => e.preventDefault(),
    onDrop: async (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      setFileName(file.name);
      setFileContents(await readAsText(file));
    },
    placeholder: "Enter text, enter an url, or drop a file here."
  })), /* @__PURE__ */ React.createElement("div", {
    className: `viewer ${sarif ? "viewerActive" : ""}`
  }, /* @__PURE__ */ React.createElement(Viewer, {
    logs: sarif && [sarif],
    filterState: {
      Baseline: {value: ["new", "unchanged", "updated"]},
      Level: {value: ["error"]}
    },
    successMessage: "Real-time scanning completed and no live secrets were detected."
  }))));
}
