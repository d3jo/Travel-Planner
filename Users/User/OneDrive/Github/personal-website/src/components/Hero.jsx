import { motion } from 'framer-motion';


const MY_INTRODUCTION = `Statistics at University of Waterloo`;
const MY_FIELD = 'Data Science, Data Modelling and Machine Learning';



const container = (delay) => ({
    hidden: { x : -100 , opacity: 0},
    visible: {
        x:0,
        opacity:1,
        transition: { duration: 0.5, delay: delay},
    },
});


const Hero = () => {
    return (
        <div className="border-b border-neutral-900 pb-4 lg:mb-35">
            <div className="flex flex-col items-center text-center w-full">
                <motion.span
                    variants={container(0.3)}
                    initial="hidden"
                    animate="visible"
                    className="bg-gradient-to-r from-pink-300 via-slate-400 to-purple-500 bg-clip-text text-5xl roboto text-transparent">
                    Data Scientist
                </motion.span>
                <motion.h1
                    variants={container(0)}
                    initial={{ x: -100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="pb-16 lg:mt-16 roboto text-5xl bg-gradient-to-r from-pink-300 via-slate-400 to-purple-500 bg-clip-text text-transparent">
                    Ajun Jo
                </motion.h1>
                <motion.p
                    variants={container(0.8)}
                    initial="hidden"
                    animate="visible"
                    className="my-2 text-xl py-6 fontlig tracking-tighter">
                    {MY_INTRODUCTION}
                    <motion.p className="bg-gradient-to-r from-pink-300 via-slate-400 to-purple-500 bg-clip-text tracking-tight text-transparent">
                        {MY_FIELD}
                    </motion.p>
                </motion.p>
            </div>
        </div>
    );
};

export default Hero;

<motion.div animate={{ x: 100 }} />