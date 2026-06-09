import { motion, useReducedMotion } from "framer-motion";

export default function PageTransition({ children }) {
  const reduced = useReducedMotion();

  const variants = reduced
    ? { initial: {}, animate: {}, exit: {} }
    : {
        initial: { x: -60, opacity: 0 },
        animate: { x: 0, opacity: 1 },
        exit:    { x: 60, opacity: 0 },
      };

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={reduced ? { duration: 0 } : { duration: 0.55, ease: "easeInOut" }}
      style={{ width: "100%" }}
    >
      {children}
    </motion.div>
  );
}
