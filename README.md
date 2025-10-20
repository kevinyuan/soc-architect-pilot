# SoC Pilot - AI-Powered System-on-Chip Design Platform

[![AWS Hackathon 2025](https://img.shields.io/badge/AWS%20Hackathon-2025-orange)](https://aws.amazon.com)
[![Built with AWS](https://img.shields.io/badge/Built%20with-AWS-FF9900?logo=amazon-aws)](https://aws.amazon.com)
[![Powered by Bedrock](https://img.shields.io/badge/Powered%20by-Amazon%20Bedrock-232F3E)](https://aws.amazon.com/bedrock/)

> Transforming SoC architecture exploration from months to minutes with AI

**Built with ❤️ using AWS services for AWS Hackathon 2025**

## 🎬 Background

**The Opportunity:** The $600B+ semiconductor industry powers every smartphone, data center server, and autonomous vehicle. Chip design involves five phases (Architecture → RTL → Verification → Physical Design → Manufacturing), each taking months.

**Architecture Design** - the first phase where engineers define chip components and connections - is the most strategic decision point. It determines product success, locks in downstream costs ($5-10M+ if wrong), and requires CEO/CTO approval.

**The Critical Bottleneck:** Traditional SoC architecture design methodologies are **stuck in the Stone Age**. Companies can only explore 1-2 architecture variants due to months of research, design exploration, modeling, and simulation required per variant, forcing strategic bets with insufficient data.

## 🏆 Solution: SoC Pilot

SoC Pilot is the **"ChatGPT for chip architecture"** - the world's first AI-native platform transforming architecture design from months of research to minutes of conversation.

### Core Capabilities

- **Conversational Design Interface** - Natural language requirements capture using Amazon Nova Premier, eliminating months of manual specification writing
- **AI-Powered Design Space Exploration** - Generate and compare 10+ architecture variants in minutes, analyzing performance vs. power trade-offs automatically
- **Zero-Code Architecture Generation** - No SystemC/Verilog coding required, democratizing chip design for system architects and product managers
- **RAG-Based Component Intelligence** - Leverage organizational knowledge and industry best practices through intelligent component selection and recommendations
- **Real-Time Validation & Optimization** - Automated design rule checking (DRC) with AI-suggested fixes, catching critical issues before costly downstream phases

### Key Use Cases

1. **Concept Brainstorming** - Rapid "what-if" exploration without coding
2. **Design Space Exploration** - Evaluate 10+ variants, compare trade-offs (performance vs. power)
3. **Specification Generation** - Auto-generate detailed architecture specifications with beautiful and interactive architecture diagrams for executive review
4. **Feasibility Studies** - Quick validation, identify bottlenecks, make go/no-go decisions
5. **Risk Mitigation** - Catch issues early, automated DRC validation, AI-suggested fixes

## 🎯 Target Customers

### Chip Design Companies (Upstream)
- **Fabless Houses**: Mobile processors, AI accelerators
- **IDM Companies**: Broad product portfolios
- **Value**: Faster iteration, consistent quality, capture best practices

### System Companies (Downstream)
- **Cloud/Data Center Providers**: Custom server processors, AI chips
- **OEM/ODM**: Consumer electronics, automotive
- **Value**: Strategic investment decisions, rapid proof-of-concepts

### Ecosystem Partners (Complementary, Not Competitive)
- **IP Vendors**: Early recommendations → qualified leads
- **EDA Tools**: Better-defined inputs → reduced rework
- **Foundries**: Process-optimized architectures → earlier engagement

## 💡 The Impact

### For Customers
Data-driven strategic decisions (10+ variants vs. 1-2), faster time-to-market, avoid $5-10M mistakes

### For AWS
Showcase Bedrock transforming strategic decisions in a $600B industry, attract enterprise customers, drive compute consumption

### For the Market
Create new AI-native design tools category, enable ecosystem growth (IP vendors, EDA tools, foundries)


## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/kevinyuan/soc-architect-pilot.git
cd soc-architect-pilot
```

### 2. Install Dependencies

```bash
# Install frontend dependencies
cd frontend && npm install

# Install backend dependencies
cd ../backend && npm install
```

### 3. Configure Environment

```bash
cd backend
cp .env.example .env
# Edit .env file with your AWS credentials and configuration
```

### 4. Run the Application

```bash
# Terminal 1: Start backend
cd backend && npm run dev

# Terminal 2: Start frontend
cd frontend && npm run dev
```

### 5. Access the Application

Open your browser and navigate to `http://localhost:9002`

## 🤝 Contact

For questions and discussions, please use GitHub Discussions:

https://github.com/kevinyuan/soc-architect-pilot/discussions

## 📝 License

Proprietary - All rights reserved. See [LICENSE](LICENSE) file.
