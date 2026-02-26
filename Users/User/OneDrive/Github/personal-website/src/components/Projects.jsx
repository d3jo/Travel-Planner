const PROJECTS = [
    {
        title: "Snapshots.Me",
        description:
          "A personal portfolio website showcasing projects, skills, and introducing myself.",
        technologies: ["HTML", "CSS", "Javascript", "React"],
        github: "https://github.com/d3jo/Snapshots.Me",
    },
    {
      title: "CNN Dog Breed Classifier",
      description:
        "A Convolutional Neural Network model that has been trained by hours of deep learning on the dog images of different breeds and classifies them with more than 95 percent accuracy",
      technologies: ["Tensorflow", "Matplotlib", "OpenCV"],
    },
    {
      title: "California Real Estate Analytics",
      description:
        "Python data analytic project which provides visualizations and insights of real estate information in California",
      technologies: ["Matplotlib", "Python", "Seaborn", "Pandas", "NumPy"],
      github: "https://github.com/d3jo/Real-Estate-Analysis",
    },
    {
      title: "OOP Chess Game in C++",
      description:
        "An interactive chess game for humans and computer players showcasing OOP principles and algorithms based on observer design pattern",
      technologies: ["C++"],
    },
    {
        title: "Sephora Product Intelligence and Machine Learning Analysis",
        description:
          "Performed ETL process on product data, transforming raw datasets into BI dashboards and ML models",
        technologies: ["PyTorch", "Python"],
        github: "https://github.com/d3jo/Sephora_BI_ML_Analysis",
      },
  ];
  
import { motion } from 'framer-motion';
import { FaGithub } from 'react-icons/fa';


const Projects = () => {
    return (
        <div className="w=full max-w flex justify-center">
            <div className="w-full max-w">
              <hr className="my-5"></hr>
                <h1 className="my-20 text-center text-6xl font-bold">Project Gallery</h1>
                {PROJECTS.map((project, index) => (
                    <div key={index} className="mb-8 text-center max-w-2xl mx-auto">
                      <div className="text-3xl font-bold text-center max-w-2xl mx-auto mb-4 text-transparent bg-gradient-to-r from-red-500 via-slate-400 to-purple-500 bg-clip-text ">
                            {project.title}
                      </div>
                        
                        <p className="mb-4 text-lg text-slate-300">{project.description}</p>
                        <div className="flex justify-center flex-wrap">
                            {project.technologies.map((tech, index) => (
                                <span key={index} className="mr-2 mt-2 rounded-2xl bg-neutral-900 px-2 py-1 text-sm font-medium text-purple-700">
                                    {tech}
                                </span>
                            ))}
                        </div>
                        {project.github && (
                            <a
                                href={project.github}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 mt-4 text-neutral-400 hover:text-white transition-colors duration-200"
                            >
                                <FaGithub className="text-xl" />
                                <span className="text-sm">View on GitHub</span>
                            </a>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Projects;
