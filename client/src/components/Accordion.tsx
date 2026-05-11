import React, { useState } from 'react';

interface AccordionProps {
  title: string;
  children: React.ReactNode;
}

const Accordion: React.FC<AccordionProps> = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-8">
      <button
        className="accordion-btn w-full text-left py-3 px-4 bg-gray-100 rounded-lg font-semibold flex justify-between items-center"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{title}</span>
        <i className={`fas fa-chevron-down transform transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className={`accordion-content bg-gray-50 rounded-b-lg ${isOpen ? 'open' : ''}`} style={{ maxHeight: isOpen ? '1000px' : '0', overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

export default Accordion;