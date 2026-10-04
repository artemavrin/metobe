import { listMembers } from "@metobe/core/users";
import { redirect } from "next/navigation";

// There is always someone — at least you: straight to the first person in the list.
const UsersPage = async () => {
  const [first] = await listMembers();
  redirect(first ? `/settings/users/${first.id}` : "/settings/users/new");
};

export default UsersPage;
