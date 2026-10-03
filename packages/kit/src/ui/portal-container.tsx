"use client";

import { createContext, useContext } from "react";

// Lets composed controls stay inside a native dialog's top layer.
export const PortalContainerContext = createContext<HTMLElement | null>(null);
export const usePortalContainer = () => useContext(PortalContainerContext);
