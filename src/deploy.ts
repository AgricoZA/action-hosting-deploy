/**
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { exec } from "@actions/exec";

export type SiteDeploy = {
  site: string;
  target?: string;
  url: string;
  expireTime: string;
};

export type ErrorResult = {
  status: "error";
  error: string;
};

export type ChannelSuccessResult = {
  status: "success";
  result: { [key: string]: SiteDeploy };
};

export type ProductionSuccessResult = {
  status: "success";
  result: {
    hosting: string | string[];
  };
};

export type DeployConfig = {
  projectId: string;
  expires: string;
  channelId: string;
  target?: string;
};

export type ProductionDeployConfig = {
  projectId: string;
  target?: string;
};

export function interpretChannelDeployResult(
  deployResult: ChannelSuccessResult
): { expireTime: string; urls: string[] } {
  const allSiteResults = Object.values(deployResult.result);

  const expireTime = allSiteResults[0].expireTime;
  const urls = allSiteResults.map((siteResult) => siteResult.url);

  return {
    expireTime,
    urls,
  };
}

async function execWithCredentials(
  args: string[],
  projectId,
  gacFilename,
  debug: boolean = false
) {
  let deployOutputBuf: Buffer[] = [];

  try {
    await exec("npm cache clean --force");
    await exec("npm install -g firebase-tools@13.33.0");
    await exec(
      "npx firebase-tools@13.33.0",
      [
        ...args,
        ...(projectId ? ["--project", projectId] : []),
        debug
          ? "--debug" // gives a more thorough error message
          : "--json", // allows us to easily parse the output
      ],
      {
        listeners: {
          stdout(data: Buffer) {
            deployOutputBuf.push(data);
          },
        },
        env: {
          ...process.env,
          FIREBASE_DEPLOY_AGENT: "action-hosting-deploy",
          GOOGLE_APPLICATION_CREDENTIALS: gacFilename, // the CLI will automatically authenticate with this env variable set
        },
      }
    );
  } catch (e) {
    console.log(Buffer.concat(deployOutputBuf).toString("utf-8"));
    console.log(e.message);

    if (debug === false) {
      console.log(
        "Retrying deploy with the --debug flag for better error output"
      );
      await execWithCredentials(args, projectId, gacFilename, true);
    } else {
      throw e;
    }
  }

  return deployOutputBuf.length
    ? deployOutputBuf[deployOutputBuf.length - 1].toString("utf-8")
    : ""; // output from the CLI
}

export async function deployPreview(
  gacFilename: string,
  deployConfig: DeployConfig
) {
  const { projectId, channelId, target, expires } = deployConfig;

  const deploymentText = await execWithCredentials(
    [
      "hosting:channel:deploy",
      channelId,
      ...(target ? ["--only", target] : []),
      ...(expires ? ["--expires", expires] : []),
    ],
    projectId,
    gacFilename
  );

  const deploymentResult = JSON.parse(deploymentText.trim()) as
    | ChannelSuccessResult
    | ErrorResult;

  return deploymentResult;
}

export async function deployProductionSite(
  gacFilename,
  productionDeployConfig: ProductionDeployConfig
) {
  const { projectId, target } = productionDeployConfig;

  const deploymentText = await execWithCredentials(
    ["deploy", "--only", `hosting${target ? ":" + target : ""}`],
    projectId,
    gacFilename
  );

  const deploymentResult = JSON.parse(deploymentText) as
    | ProductionSuccessResult
    | ErrorResult;

  return deploymentResult;
}

export async function deployRealtimeDatabaseRules(
  gacFilename: string,
  productionDeployConfig: ProductionDeployConfig
) {
  const { projectId, target } = productionDeployConfig;

  const deploymentText = await execWithCredentials(
    ["deploy", "--only", `database${target ? ":" + target : ""}`],
    projectId,
    gacFilename
  );

  const deploymentResult = JSON.parse(deploymentText.trim()) as
    | ChannelSuccessResult
    | ErrorResult;

  return deploymentResult;
}
