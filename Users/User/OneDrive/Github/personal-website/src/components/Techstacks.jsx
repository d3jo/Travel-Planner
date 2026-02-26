import { FaPython } from 'react-icons/fa'; // Python
import { SiR, SiGnubash, SiTensorflow, SiPytorch, SiMysql } from 'react-icons/si'; // C++, C, R, Bash, TensorFlow, PyTorch
import '../styles.css'; // Import custom styles if necessary

const Techstacks = () => {
    return (
        <div className="my-10  pb-24">
            <hr></hr>
            <h1 className="my-20 text-center text-6xl font-bold">Tech Stacks</h1>
            <div className="flex flex-wrap items-center justify-center gap-4">
                <div className="rounded-2xl border-4 border-neutral-800 p-4 animate-float">
                    <SiR className="text-7xl" style={{ color: '#276DC3' }} />
                </div>
                <div className="rounded-2xl border-4 border-neutral-800 p-4 animate-float3">
                    <SiGnubash className="text-7xl" style={{ color: '#4EAA25' }} />
                </div>
                <div className="rounded-2xl border-4 border-neutral-800 p-4 animate-float">
                    <SiPytorch className="text-7xl" style={{ color: '#EE4C2C' }} />
                </div>
                <div className="rounded-2xl border-4 border-neutral-800 p-4 animate-float3">
                    <SiTensorflow className="text-7xl" style={{ color: '#FF6F00' }} />
                </div>
                <div className="rounded-2xl border-4 border-neutral-800 p-4 animate-float">
                    <SiMysql className="text-7xl" style={{ color: '#FFA500'}} />
                </div>

                <div className="rounded-2xl border-4 border-neutral-800 p-4 animate-float">
                    <FaPython className="text-7xl" style={{ color: '#3776AB' }} />
                </div>
            </div>
        </div>
    );
};

export default Techstacks;



