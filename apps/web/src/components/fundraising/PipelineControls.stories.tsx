import type { Meta, StoryObj } from "@storybook/react-vite";
import { toPipelineRow } from "../../lib/pipeline-rows";
import {
  InterestChoice,
  InterestPick,
  NextCallEditor,
  ReferredByPicker,
  StatusPick,
  ValueEditor,
} from "./PipelineControls";
import { SAMPLE_CONTACTS, SAMPLE_PROSPECTS } from "./pipeline-fixtures";

const noop = () => {};
const [row] = SAMPLE_PROSPECTS.map(toPipelineRow);

function Controls() {
  return (
    <div className="flex flex-col items-start gap-4 text-sm">
      <StatusPick row={row!} onChange={noop} />
      <InterestChoice row={row!} onChange={noop} />
      <InterestPick row={row!} onChange={noop} />
      <ReferredByPicker
        row={row!}
        contacts={SAMPLE_CONTACTS}
        trigger={<span className="underline">Add</span>}
        onPick={noop}
        onCreate={noop}
      />
      <NextCallEditor row={row!} onSave={noop}>
        Nov 4
      </NextCallEditor>
      <ValueEditor label="Next step" value="Send the deck" onSave={noop}>
        Send the deck
      </ValueEditor>
    </div>
  );
}

const meta = {
  title: "Fundraising/PipelineControls",
  component: Controls,
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Controls>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Every inline control of a pipeline row. */
export const All: Story = {};
