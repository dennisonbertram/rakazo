import type { Meta, StoryObj } from "@storybook/react-vite";
import { withPageBehind } from "../stories/decorators";
import { ArtifactShareDialog } from "./ArtifactShareDialog";

const meta = {
  title: "Components/ArtifactShareDialog",
  component: ArtifactShareDialog,
  decorators: [withPageBehind()],
  args: {
    name: "Weekly dashboard",
    url: "https://app.example.test/s#example-token",
    busy: false,
    error: null,
    onStop: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof ArtifactShareDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Right after the link was made: the only time it can be copied. */
export const NewLink: Story = {};
/** Reopening an existing share: the link is not stored, so only Stop sharing remains. */
export const ExistingShare: Story = { args: { url: null } };
