import mirrorSelfie from '../assets/MePic.jpg';
import { motion } from 'framer-motion';


const ABOUT_TEXT = [
    "Welcome to Snapshots.Me! I'm Ajun, and this is my personal space where you can view some aspects of me and explore my professional journey, personal interests, and a bit of everything in between.",
    "Here, you’ll find my portfolio showcasing my work and a timeline of my career. Whether you're a potential employer, a fellow enthusiast, or my friend, I hope you find something that resonates with you.",
    "Thanks for visiting, and feel free to reach out!"
];

const About = () => {
    return (
        <div className="border-b border-neutral-900 pb-4">
            <hr></hr>
            <h1 className="my-20 text-center text-6xl font-bold"><span className="text-neutral-500">About </span>Me</h1>
            <div className="flex flex-wrap lg:flex-nowrap">
                <div className="w-full lg:w-1/2 lg:px-8 ">
                    <motion.p
                    whileInView={{opacity: 1, x: 0 }}
                    initial={{opacity: 1, x: -100}}
                    transition={{ duration: 0.2 }}>February 2026 New York</motion.p>
                    <motion.img
                    whileInView={{opacity: 1, x: 0 }}
                    initial={{opacity: 1, x: -400}}
                    transition={{ duration: 0.9 }} src={mirrorSelfie} alt="Mirror Selfie" className="w-full h-auto rounded-lg shadow-lg" />
                </div>
                <div className="w-full lg:w-1/2 flex items-center">
                    <div className="flex justify-center lg:justify-end">
                        <motion.p 
                        whileInView={{opacity: 1, x: 0 }}
                        initial={{opacity: 1, x: 400}}
                        transition={{ duration: 0.5 }}
                        className="my-2 max-w-xl px-4 text-xl">
                            {ABOUT_TEXT.map((paragraph, index) => (
                            <p key={index} className="mb-9">{paragraph}</p>
                            ))}
                        </motion.p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default About;

