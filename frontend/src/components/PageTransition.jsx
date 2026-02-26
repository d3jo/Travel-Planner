// src/components/PageTransition.jsx
import { motion } from "framer-motion";

const variants = {
  initial: { x: -60, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit:    { x: 60, opacity: 0 },
};

export default function PageTransition({ children }) {
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.55, ease: "easeInOut" }}
      style={{ width: "100%" }}
    >
      {children}
    </motion.div>
  );
}
