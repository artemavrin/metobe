import { notFound } from "next/navigation";

import { Showcase } from "./showcase";

// Design-system showcase for local development only.
const ShowcasePage = () => {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <Showcase />;
};

export default ShowcasePage;
