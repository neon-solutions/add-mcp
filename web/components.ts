import { defineComponents } from "blume";

import Footer from "./components/Footer.astro";
import Header from "./components/Header.astro";

export default defineComponents({
  layout: {
    Header,
    Footer,
  },
});
