/**
 * Copyright 2021 NTT Corporation.
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

import { Reply } from "@/lib/captureControl/Reply";

export interface Importable {
  importZipFile(
    importFileName: string,
    selectOption: { includeProject: boolean; includeTestResults: boolean }
  ): Promise<Reply<{ name: string; id: string }>>;
}

export class ImportAction {
  constructor(private dispatcher: Importable) {}

  public async importZip(
    importFileName: string,
    selectOption: { includeProject: boolean; includeTestResults: boolean }
  ): Promise<{
    name: string;
    id: string;
  }> {
    const reply = await this.dispatcher.importZipFile(
      importFileName,
      selectOption
    );

    if (reply.error?.code === "import_test_result_not_exist") {
      throw new Error(`import-test-result-not-exist`);
    }

    if (reply.error?.code === "import_project_not_exist") {
      throw new Error(`import-project-not-exist`);
    }

    if (!reply.data) {
      throw new Error(`import-data-error`);
    }

    const outputItem = {
      name: reply.data.name,
      id: reply.data.id,
    };

    return outputItem;
  }
}
