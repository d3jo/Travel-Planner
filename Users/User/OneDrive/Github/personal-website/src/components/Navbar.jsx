import { FaLinkedin, FaGithub, FaCamera } from 'react-icons/fa';

const Navbar = () => {
    return (
        <nav className="mb-20 flex items-center justify-between py-6">
            {/* Left: site title */}
            <div className="flex flex-shrink-0 items-center gap-5">
                <FaCamera className="text-4xl text-purple-400 opacity-80" />
                <h1 className="text-6xl font-light tracking-wide leading-none text-white">
                    Snapshots.Me
                </h1>
            </div>

            {/* Right: social icons + resume button */}
            <div className="flex items-center gap-6">
                {/* Social icons */}
                <div className="flex items-center gap-4 text-4xl">
                    <a href="https://www.linkedin.com/in/ajunjo/" target="_blank" rel="noopener noreferrer"
                       className="text-neutral-400 hover:text-white transition-colors duration-200">
                        <FaLinkedin />
                    </a>
                    <a href="https://github.com/d3jo" target="_blank" rel="noopener noreferrer"
                       className="text-neutral-400 hover:text-white transition-colors duration-200">
                        <FaGithub />
                    </a>
                </div>

                {/* Divider */}
                <div className="h-8 w-px bg-neutral-600"></div>

                {/* Resume button */}
                <button
                    onClick={() => window.open('/Snapshots.Me/Ajun Jo Resume.pdf', '_blank')}
                    className="bg-gradient-to-r from-purple-300 via-slate-400 to-blue-600 bg-clip-text text-transparent
                               text-2xl tracking-tight font-medium px-6 py-1.5 ml-4
                               rounded-3xl border-4 border-neutral-300 transition duration-300">
                    View Resume
                </button>
            </div>
        </nav>
    );
};

export default Navbar;


