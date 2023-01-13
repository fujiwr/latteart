/**
 * Copyright 2022 NTT Corporation.
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

import MermaidGraph from "../mermaidGraph/MermaidGraph";
import SequenceDiagramGraphExtender from "../mermaidGraph/extender/SequenceDiagramGraphExtender";
import TextUtil from "./TextUtil";
import { SequenceView, SequenceViewNode } from "src/common";

interface NoteInfo {
  sequence: number;
  index?: number;
  type: string;
  details: string;
}

export interface SequenceDiagramGraphCallback {
  onClickActivationBox: (sequences: number[]) => void;
  onClickEdge: (sequences: number[]) => void;
  onClickScreenRect: (sequence: number) => void;
  onClickNote: (note: NoteInfo) => void;
  onRightClickNote: (
    note: NoteInfo,
    eventInfo: { clientX: number; clientY: number }
  ) => void;
  onRightClickLoopArea: (
    note: NoteInfo,
    eventInfo: { clientX: number; clientY: number }
  ) => void;
}

/**
 * Convert Sequence View model to Diagram Graph.
 * @param screenHistory  Screen transition history.
 * @param windows Window informations.
 * @param callback.onClickEdge  Callback function called when you click Edge.
 * @param callback.onClickScreenRect  Callback function called when Rect is clicked.
 * @param callback.onClickNote  Callback function called by clicking Note.
 * @param callback.onRightClickNote  Callback function called by right-clicking on Note.
 * @param callback.onRightClickLoopArea  Callback function called by right-clicking on LoopArea.
 * @returns Graph text and graph extension information.
 */
export async function convertToSequenceDiagramGraph(
  view: SequenceView,
  callback: SequenceDiagramGraphCallback = {
    onClickActivationBox: () => {
      /* Do nothing */
    },
    onClickEdge: () => {
      /* Do nothing */
    },
    onClickScreenRect: () => {
      /* Do nothing */
    },
    onClickNote: () => {
      /* Do nothing */
    },
    onRightClickNote: () => {
      /* Do nothing */
    },
    onRightClickLoopArea: () => {
      /* Do nothing */
    },
  }
): Promise<MermaidGraph> {
  const source = extractGraphSource(view);

  const graphText = buildGraphText(source);

  const notes = view.scenarios
    .flatMap(({ nodes }) => nodes)
    .flatMap(({ testSteps }) => testSteps)
    .flatMap((testStep) => {
      if (!testStep.notes) {
        return [];
      }

      return testStep.notes.map((note, index) => {
        return {
          sequence: source.testStepIdToSequence.get(testStep.id) ?? 0,
          index,
          type: note.tags.includes("bug") ? "bug" : "notice",
          details: note.details ?? "",
        };
      });
    });

  const testPurposes = view.scenarios.flatMap(({ testPurpose, nodes }) => {
    if (!testPurpose) {
      return [];
    }

    const firstTestStepId = nodes.at(0)?.testSteps.at(0)?.id ?? "";
    const firstSequence = source.testStepIdToSequence.get(firstTestStepId) ?? 0;

    return [
      {
        sequence: firstSequence,
        type: "intention",
        details: testPurpose.details ?? "",
      },
    ];
  });

  const edges = view.scenarios
    .flatMap(({ nodes }) => nodes)
    .map((node, index, nodes) => {
      const nextNode = nodes.at(index + 1);

      return {
        source: { title: "", url: "", screenDef: node.screenId },
        target: {
          title: "",
          url: "",
          screenDef: (nextNode ?? node).screenId,
        },
        sequences: node.testSteps.flatMap((testStep) => {
          const sequence = source.testStepIdToSequence.get(testStep.id);

          if (sequence === undefined) {
            return [];
          }

          return [sequence];
        }),
      };
    });

  const graphExtender = new SequenceDiagramGraphExtender({
    callback: {
      onClickActivationBox: (index: number) =>
        callback.onClickActivationBox(edges[index].sequences),
      onClickEdge: (index: number) =>
        callback.onClickEdge(edges[index].sequences),
      onClickScreenRect: (index: number) =>
        callback.onClickScreenRect(
          source.testStepIdToSequence.get(
            view.scenarios
              .flatMap(({ nodes }) => nodes)
              .find(({ screenId }) => screenId === view.screens[index].id)
              ?.testSteps.at(0)?.id ?? ""
          ) ?? 0
        ),
      onClickNote: (index: number) => callback.onClickNote(notes[index]),
      onRightClickNote: (
        index: number,
        eventInfo: { clientX: number; clientY: number }
      ) => {
        callback.onRightClickNote(notes[index], eventInfo);
      },
      onRightClickLoopArea: (
        index: number,
        eventInfo: { clientX: number; clientY: number }
      ) => {
        callback.onRightClickLoopArea(testPurposes[index], eventInfo);
      },
    },
    tooltipTextsOfNote: notes.map((noteInfo) => noteInfo.details),
    tooltipTextsOfLoopArea: testPurposes.map(
      (intentionInfo) => intentionInfo.details
    ),
    nameMap: new Map(view.screens.map(({ name }, index) => [index, name])),
  });

  console.log(graphText);

  return {
    graphText,
    graphExtender,
  };
}

function extractGraphSource(view: SequenceView) {
  const windowIdToName = new Map(
    view.windows.map(({ id, name }) => [id, name])
  );

  const testStepIdToSequence = new Map(
    view.scenarios
      .flatMap(({ nodes }) =>
        nodes.flatMap(({ testSteps }) => testSteps.map(({ id }) => id))
      )
      .map((id, index) => [id, index + 1])
  );

  const nodes = view.scenarios.flatMap((scenario) => {
    const testPurposeSequence = testStepIdToSequence.get(
      scenario.nodes.at(0)?.testSteps.at(0)?.id ?? ""
    );
    if (testPurposeSequence === undefined) {
      return [];
    }

    return scenario.nodes
      .reduce(
        (acc, node, index, nodes) => {
          const beforeNode = index > 0 ? nodes.at(index - 1) : undefined;

          if (beforeNode?.windowId !== node.windowId) {
            const windowName = windowIdToName.get(node.windowId);
            const sequence = testStepIdToSequence.get(
              node.testSteps.at(0)?.id ?? ""
            );

            if (windowName !== undefined && sequence !== undefined) {
              acc.push({
                window: { sequence, text: windowName },
                nodes: [],
              });
            }
          }

          acc.at(-1)?.nodes.push(node);

          return acc;
        },
        new Array<{
          window: { sequence: number; text: string };
          nodes: Omit<SequenceViewNode, "windowId">[];
        }>()
      )
      .flatMap(({ window, nodes }) =>
        nodes.map(({ screenId, testSteps }) => {
          return {
            scenario: {
              sequence: testPurposeSequence,
              text: scenario.testPurpose?.value ?? "",
            },
            window,
            screenId,
            testSteps,
          };
        })
      );
  });

  return { screens: view.screens, nodes, testStepIdToSequence };
}

function buildGraphText(source: {
  screens: { id: string; name: string }[];
  nodes: {
    scenario: { sequence: number; text: string };
    window: { sequence: number; text: string };
    screenId: string;
    testSteps: SequenceViewNode["testSteps"];
  }[];
  testStepIdToSequence: Map<string, number>;
}) {
  const scenarios = source.nodes.reduce((acc, node, index, array) => {
    const beforeItem = index > 0 ? array.at(index - 1) : undefined;
    const nextItem = array.at(index + 1);

    const lastTestStep = node.testSteps.at(-1);
    const screenTransitionTrigger = `(${source.testStepIdToSequence.get(
      lastTestStep?.id ?? ""
    )})${lastTestStep?.type}: ${TextUtil.escapeSpecialCharacters(
      TextUtil.ellipsis(
        TextUtil.toSingleLine(lastTestStep?.element?.text ?? ""),
        20
      )
    )}`;
    const screenTransitionTexts = nextItem
      ? nextItem.scenario.text !== node.scenario.text ||
        nextItem.window.text !== node.window.text
        ? [`${node.screenId} --x ${node.screenId}: ;`]
        : [
            `${node.screenId} ->> ${nextItem.screenId}: ${screenTransitionTrigger};`,
          ]
      : [];

    const screenIndex = source.screens.findIndex(
      ({ id }) => id === node.screenId
    );
    const beforeScreenIndex = source.screens.findIndex(
      ({ id }) => id === beforeItem?.screenId
    );

    const contextTexts = (() => {
      const lines = [
        ...buildCommentTexts(node, source.testStepIdToSequence, "right"),
        ...screenTransitionTexts,
      ];

      return lines.length === 0
        ? [
            `Note ${
              screenIndex >= 1 && screenIndex > beforeScreenIndex
                ? "left"
                : "right"
            } of ${node.screenId}: DUMMY_COMMENT;`,
          ]
        : lines;
    })();

    const nodeTexts = [
      `activate ${node.screenId};`,
      ...contextTexts,
      `deactivate ${node.screenId};`,
    ];

    const scenarioItemTexts = [
      ...(() => {
        if (
          node.scenario.text &&
          beforeItem?.scenario.text !== node.scenario.text
        ) {
          return [
            `alt (${node.scenario.sequence})${TextUtil.escapeSpecialCharacters(
              node.scenario.text
            )};`,
            `opt (${node.window.sequence})${node.window.text};`,
          ];
        }

        if (node.window.text && beforeItem?.window.text !== node.window.text) {
          return [`opt (${node.window.sequence})${node.window.text};`];
        }

        return [];
      })(),
      ...nodeTexts,
      ...(() => {
        if (
          node.scenario.text &&
          nextItem?.scenario.text !== node.scenario.text
        ) {
          return ["end;", "end;"];
        }

        if (node.window.text && nextItem?.window.text !== node.window.text) {
          return ["end;"];
        }

        return [];
      })(),
    ];

    return [...acc, ...scenarioItemTexts];
  }, new Array<string>());

  const screenTexts = source.screens.map(({ id, name }) => {
    const lineLength = 15;
    return `participant ${id} as ${TextUtil.escapeSpecialCharacters(
      TextUtil.lineBreak(
        TextUtil.ellipsis(TextUtil.toSingleLine(name), lineLength * 3),
        lineLength
      )
    )};`;
  });

  return ["sequenceDiagram;", ...screenTexts, ...scenarios, ""].join("\n");
}

function buildCommentTexts(
  node: Pick<SequenceViewNode, "testSteps" | "screenId">,
  testStepIdToSequence: Map<string, number>,
  position: "left" | "right"
) {
  return node.testSteps.flatMap((testStep) => {
    const sequence = testStepIdToSequence.get(testStep.id);

    return (
      testStep.notes?.map((note, index) => {
        const tags = TextUtil.lineBreak(
          `(${sequence}-${index})${note.tags
            .map((tag) => `[${tag}]`)
            .join("")}`,
          16
        );
        const value = TextUtil.escapeSpecialCharacters(
          TextUtil.lineBreak(note.value, 16)
        );

        return `Note ${position} of ${node.screenId}: ${tags}<br/>-<br/>${value};`;
      }) ?? []
    );
  });
}
