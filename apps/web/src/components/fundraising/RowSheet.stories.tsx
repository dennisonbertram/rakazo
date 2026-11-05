import type { Meta, StoryObj } from "@storybook/react-vite";
import { toPipelineRow } from "../../lib/pipeline-rows";
import { SAMPLE_CONTACTS, SAMPLE_PROSPECTS } from "./pipeline-fixtures";
import { RowSheet } from "./RowSheet";

const noop = () => {};
const edits = {
  status: noop,
  interest: noop,
  nextStep: noop,
  nextCall: noop,
  amount: noop,
  referrer: noop,
  createReferrer: noop,
  log: noop,
};
const rows = SAMPLE_PROSPECTS.map(toPipelineRow);

const meta = {
  title: "Fundraising/RowSheet",
  component: RowSheet,
  parameters: { layout: "fullscreen" },
  args: { contacts: SAMPLE_CONTACTS, edits, onClose: noop, onEditContact: noop },
} satisfies Meta<typeof RowSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { row: rows[0]! } };
export const Logging: Story = { args: { row: rows[1]!, logging: true } };
/** Committed rows keep Send SAFE reachable on a phone. */
export const Committed: Story = { args: { row: rows[4]!, safe: { send: noop } } };
/** Waiting for Mercury: Open Mercury and Not sent. */
export const WaitingForMercury: Story = {
  args: { row: rows[5]!, safe: { openMercury: noop, notSent: noop } },
};
