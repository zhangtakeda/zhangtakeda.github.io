window.__methodAdvisorData = {
    data: {
      label: '数据与变换',
      options: [
        {
          id: 'interpolation', label: '光滑节点数据，需要连续表示',
          title: '先决定全局还是局部，再决定插值阶数',
          summary: '插值要求穿过数据点；真正影响稳定性的通常是节点分布、基函数表示、边界行为和形状约束，而不是单独追求更高次数。',
          start: ['有界区间的光滑数据：Chebyshev 节点配重心插值。', '局部、单调或含拐点数据：三次样条、B 样条或 PCHIP。'],
          upgrade: ['周期且等距采样时改用三角插值与 FFT。', '散乱点或高维参数数据再考虑 RBF、局部多项式或高斯过程。'],
          checks: ['端点振荡与 Lebesgue 常数', '单调性、凸性和过冲', '节点尺度与重复/近重复节点', '导数或积分量是否对插值误差更敏感'],
          chapters: [2, 4]
        },
        {
          id: 'fitting', label: '含噪、超定或存在离群点',
          title: '把拟合写成带噪声模型的最小二乘问题',
          summary: '“穿过所有点”通常会拟合噪声。应先说明残差度量、权重和可辨识性，再选择线性最小二乘、非线性最小二乘或正则化。',
          start: ['线性模型用加权最小二乘并以 QR 求解；秩亏或病态时用 SVD。', '非线性残差用 Gauss–Newton 或 Levenberg–Marquardt。'],
          upgrade: ['离群点明显时使用 Huber 等鲁棒损失。', '参数不可辨识时加入 Tikhonov/稀疏正则化，并报告协方差或后验范围。'],
          checks: ['数值秩与奇异值谱', '残差是否呈系统结构或相关性', '训练误差与独立验证误差', '参数尺度、相关性和置信区间'],
          chapters: [2, 6, 8, 20]
        },
        {
          id: 'spectral', label: '周期信号、卷积或频谱分析',
          title: 'FFT 只是计算引擎，采样和边界约定才决定结果',
          summary: '等距周期数据适合 FFT；线性卷积需要零填充，非整数周期会产生泄漏，非平稳信号则需要局部时频表示。',
          start: ['周期等距数据用 FFT，并明确正反变换归一化。', '线性卷积至少填充到 N+M−1；非平稳信号用 STFT。'],
          upgrade: ['非均匀采样使用 NUFFT。', '局部突变、多尺度结构或压缩表示使用小波；长流数据使用 overlap-add/save。'],
          checks: ['Nyquist 条件与混叠', '窗函数、泄漏和幅值修正', '周期延拓造成的边界不连续', '零填充只细化频率采样，不增加真实分辨率'],
          chapters: [4, 12]
        },
        {
          id: 'quadrature', label: '一维、高维或带奇点积分',
          title: '按光滑性、维数和奇点结构选择求积',
          summary: '固定高阶公式并不自动可靠。可解析光滑函数、端点奇点、振荡核和高维区域需要不同的节点分配与误差估计。',
          start: ['光滑有限区间使用 Gauss 或 Clenshaw–Curtis；未知局部结构用自适应 Gauss–Kronrod。', '高维中低维度使用 sparse grid；更高维使用 QMC/Monte Carlo。'],
          upgrade: ['已知端点奇点先变量代换或专用权重求积。', '强振荡积分使用 Filon/Levin 类方法，而不是盲目细分。'],
          checks: ['误差估计是否独立于主公式', '奇点与不连续位置是否显式分区', '高维有效维数与方差集中', '积分容差是否与外层求解容差匹配'],
          chapters: [3, 20]
        },
        {
          id: 'special', label: '特殊函数、递推或极端参数',
          title: '按参数区域切换稳定表示',
          summary: '定义公式往往不是数值算法。递推方向、缩放、渐近展开和连分式需要依据主解/从属解及参数区间选择。',
          start: ['中等参数采用成熟库中的有理逼近、级数或积分表示。', '递推前先分析误差模态；从属解通常需要 Miller 反向递推。'],
          upgrade: ['大参数或转折点附近使用统一渐近展开。', '极端指数范围使用 scaled function 或对数表示。'],
          checks: ['递推方向是否放大错误解', '级数截断与消去误差', '区域切换点的连续性', 'Wronskian、微分方程残差或函数恒等式'],
          chapters: [1, 5]
        }
      ]
    },
    linear: {
      label: '线性系统',
      options: [
        {
          id: 'dense', label: '中小规模、稠密或多右端项',
          title: '优先利用矩阵结构，并复用分解',
          summary: '中小规模问题中，可靠直接分解通常优于复杂迭代。算法选择首先取决于对称性、正定性、矩形结构和数值秩。',
          start: ['一般方阵用部分主元 LU；SPD 用 Cholesky；对称不定用带主元 LDLᵀ。', '矩形最小二乘用 Householder QR；秩亏或最小范数问题用 SVD。'],
          upgrade: ['多个右端项复用分解；条件允许时用混合精度迭代精化。', '稀疏矩阵先做重排序，控制 fill-in 与消元树并行性。'],
          checks: ['主元增长、正定性和惯性', '条件数与数值秩', '分解残差和后向误差', '内存峰值与分解复用收益'],
          chapters: [6, 24]
        },
        {
          id: 'spd', label: '大型稀疏 SPD 系统',
          title: 'CG 负责迭代，AMG 或几何多重网格负责尺度',
          summary: '对称正定结构允许短递推 Krylov 方法。网格加密后是否仍高效，主要由预条件器能否处理低频误差决定。',
          start: ['中等规模可用稀疏 Cholesky；大型问题用 CG + AMG/几何多重网格。', '简单基线可从 Jacobi/IC 开始，但不应把它当作最终可扩展方案。'],
          upgrade: ['存在强各向异性或系数跳跃时使用半粗化、线松弛或能反映近零空间的 AMG。', '多层网格和高阶元可采用 p/hp multigrid 或辅助空间预条件。'],
          checks: ['矩阵是否真正对称正定', 'AMG 近零空间与粗网格质量', '迭代数是否随网格近似不变', '预条件构造成本、每步成本与总时间'],
          chapters: [6, 7, 12]
        },
        {
          id: 'saddle', label: '对称不定或鞍点块系统',
          title: '围绕 Schur 补组织预条件，而不是逐元素修补',
          summary: '约束、多场和混合有限元常产生鞍点结构。稳定性由块间耦合、inf-sup 条件和 Schur 补近似共同决定。',
          start: ['保持对称性时用 MINRES + SPD 块预条件。', '一般情形用 GMRES/FGMRES，并构造块三角或块对角预条件。'],
          upgrade: ['用质量矩阵、压力 Poisson、约束算子或物理消元近似 Schur 补。', '强耦合多场采用 field split、嵌套 Krylov 或近似块因子化。'],
          checks: ['离散空间是否满足稳定配对', 'Schur 近似的尺度与边界条件', '预条件后是否仍满足 MINRES 的对称性要求', '各场残差而非只看总残差'],
          chapters: [7, 12, 15, 17]
        },
        {
          id: 'matrixfree', label: '大型非对称或矩阵自由',
          title: '以 Krylov 方法承载算子，以预条件器承载物理',
          summary: '当矩阵无法经济分解、算子只提供矩阵向量作用，算法核心是可扩展的 Krylov 迭代与可逆的近似物理算子。',
          start: ['一般非对称系统用 GMRES；预条件器会变化或内层迭代时用 FGMRES。', '显式矩阵可先用 ILU/AMG 作基线；矩阵自由算子仍需低阶或简化物理预条件器。'],
          upgrade: ['内存受限可比较重启 GMRES 与 BiCGStab，但要接受更不规则的收敛。', '重复序列问题可使用 recycling Krylov、块 Krylov 或多右端项技术。'],
          checks: ['真实残差与预条件残差是否一致', '重启导致的停滞和非正规性', '网格独立迭代与场分量残差', '预条件构造、应用和通信成本'],
          chapters: [7, 10, 24]
        },
        {
          id: 'banded', label: '三对角、窄带或重复一维线',
          title: '带宽小并不等于可以忽略主元安全',
          summary: '紧带存储和专用消元可显著降低成本，但只适用于带宽固定、结构稳定且主元不会破坏数值稳定性的系统。',
          start: ['严格三对角且主元安全时用 Thomas；一般奇数带宽用紧带 LU。', '重复时间步中复用不变带状分解。'],
          upgrade: ['出现小主元、周期边界或块带结构时改用带主元带状 LU、循环约化或块 Thomas。', '并行长网格可使用 cyclic reduction、SPIKE 或 domain decomposition。'],
          checks: ['消元主元和对角占优条件', '带外填充是否被错误丢弃', '边界条件对带结构的破坏', '串行依赖是否成为并行瓶颈'],
          chapters: [6, 11, 24]
        }
      ]
    },
    nonlinear: {
      label: '非线性与优化',
      options: [
        {
          id: 'root', label: '方阵求根，Jacobian 可构造',
          title: 'Newton 给局部二次模型，全局化负责把它变成算法',
          summary: '纯 Newton 只在足够接近解时可靠。缩放、线搜索或信赖域、线性子问题容差和停止判据共同决定鲁棒性。',
          start: ['使用带阻尼的 Newton；小中规模直接分解 Jacobian，大规模配 Krylov。', '变量与残差先无量纲化，停止时同时检查残差和步长。'],
          upgrade: ['初值较差时使用 trust region 或 pseudo-transient continuation。', 'Jacobian 更新昂贵时使用 Broyden，但应监控近似质量。'],
          checks: ['Jacobian 导数检验', '线搜索接受率与模型下降', '线性求解容差是否符合 inexact Newton', '缩放后各残差分量是否均衡'],
          chapters: [8, 9]
        },
        {
          id: 'jfnk', label: '大型残差，适合 JVP / matrix-free',
          title: 'JFNK 省去完整 Jacobian，但不省去预条件',
          summary: 'Jacobian-vector product 可由有限差分、自动微分或解析作用获得；整体成本仍由内层 Krylov 与预条件近似控制。',
          start: ['使用 inexact Newton–Krylov；JVP 优先解析或 AD，有限差分需按尺度选扰动。', '预条件器使用低阶离散、冻结系数或物理场分裂近似 Jacobian。'],
          upgrade: ['非线性跨步困难时加入 line search、trust region 或 pseudo-transient continuation。', '多层非线性结构明显时考虑 FAS 或非线性预条件。'],
          checks: ['JVP 与显式方向导数的一致性', '内外层残差和 forcing term', '预条件器随状态变化后的灵活 Krylov', '函数评估次数而非只看 Newton 步数'],
          chapters: [7, 8, 17]
        },
        {
          id: 'nls', label: '超定非线性最小二乘',
          title: '优先利用残差结构，而不是把它当一般优化',
          summary: 'Gauss–Newton 利用 JᵀJ 的近似 Hessian；LM 在病态、远离解或残差不小的区域加入阻尼。',
          start: ['良好初值与小残差：Gauss–Newton；更稳健基线：Levenberg–Marquardt。', '线性化最小二乘用 QR；秩亏时用 SVD 或正则化。'],
          upgrade: ['有界参数使用 trust-region reflective；离群点使用鲁棒损失。', '大规模参数问题使用 Jacobian-vector / transpose-vector products 与 matrix-free least squares。'],
          checks: ['Jacobian 数值秩与参数相关性', '残差噪声模型与权重', '阻尼参数及实际/预测下降比', '训练域外预测和参数置信区间'],
          chapters: [2, 6, 8, 9]
        },
        {
          id: 'continuation', label: '多解、折点或参数扫描',
          title: '先沿解支移动，再讨论局部求解器快慢',
          summary: '参数连续变化时，前一步解是最有价值的初值。折点附近普通参数延拓失效，需要把状态与参数共同参数化。',
          start: ['平滑扫描先用自然参数延拓与自适应步长。', '接近折点改用 predictor–corrector 伪弧长延拓。'],
          upgrade: ['分岔点附近跟踪小特征值、增广系统或分支切换条件。', '寻找多个隔离解可结合 deflation、多初值或区间方法。'],
          checks: ['切向量归一化和校正收敛', '步长与曲率的自适应', '折点/分岔与单纯求解失败的区别', '分支稳定性和物理可接受性'],
          chapters: [8, 10]
        },
        {
          id: 'constrained', label: '有等式/不等式约束的优化',
          title: '约束资格条件和尺度与优化算法同等重要',
          summary: '约束优化需要同时控制目标下降、可行性和 KKT 残差。把约束简单加大罚因子往往会制造病态系统。',
          start: ['平滑中等规模使用 SQP 或 interior-point；简单边界约束使用 projected/trust-region 方法。', '无导数且维数很低时再考虑 pattern search、Nelder–Mead 或 surrogate optimization。'],
          upgrade: ['PDE 约束且参数多时使用伴随梯度与 reduced-space 方法。', '强耦合约束使用 augmented Lagrangian 或结构化 KKT 预条件。'],
          checks: ['KKT 残差与约束可行性', '梯度/Taylor remainder test', '变量、目标与约束尺度', '局部极值、活跃集稳定性和二阶条件'],
          chapters: [9, 19]
        }
      ]
    },
    time: {
      label: 'ODE / DAE',
      options: [
        {
          id: 'nonstiff', label: '非刚性、希望高精度自适应',
          title: '嵌入式显式 Runge–Kutta 是默认起点',
          summary: '非刚性系统中，稳定域不是主要限制，重点是局部误差估计、步长控制和事件定位。',
          start: ['使用 Dormand–Prince、Bogacki–Shampine 等嵌入式 RK 对。', '长时间平滑积分且函数评估昂贵时可比较 Adams–Bashforth/Moulton。'],
          upgrade: ['强波动或守恒律半离散采用 SSPRK。', '高阶高精度可考虑高阶 RK 或谱延迟校正，但先检查舍入和插值成本。'],
          checks: ['误差权重中的绝对/相对容差', '拒步率与步长控制振荡', '事件根定位误差', '时间加密后的观察阶'],
          chapters: [11]
        },
        {
          id: 'stiff', label: '强刚性或扩散主导',
          title: '选择 L-stable 方法，并把非线性求解计入时间误差预算',
          summary: '刚性意味着显式稳定步长远小于所需精度步长。隐式方法的实际效率取决于 Jacobian、Newton/Krylov 和预条件复用。',
          start: ['通用刚性问题用 BDF、SDIRK/ESDIRK 或 Radau IIA。', '线性化方便且希望避免非线性迭代时用 Rosenbrock-W。'],
          upgrade: ['强线性刚性半线性系统可用 exponential/Krylov integrator。', '跨步状态变化慢时复用 Jacobian、预条件器和分解。'],
          checks: ['A/L-stability 与 stiff accuracy', '时间误差和 Newton/线性容差的匹配', 'Jacobian 更新频率与拒步原因', '阶数降低和初始层'],
          chapters: [7, 8, 11]
        },
        {
          id: 'dae', label: '代数约束或质量矩阵奇异',
          title: '先处理一致初值和 index，再选择积分器',
          summary: 'DAE 的困难不只是刚性。约束流形、隐藏约束、index 和初始化误差会决定是否产生漂移或虚假瞬态。',
          start: ['index-1 系统使用 BDF 或隐式 RK（如 Radau IIA）。', '通过非线性约束求解构造 consistent y₀ 与必要的 ẏ₀。'],
          upgrade: ['高 index 先做 index reduction、约束稳定化或重新建模。', '长期几何约束可使用投影、SHAKE/RATTLE 类方法。'],
          checks: ['约束及其导数残差', '质量矩阵秩与代数变量识别', '初始化阶段是否引入非物理脉冲', '约束漂移和事件后的重新一致化'],
          chapters: [8, 11, 15]
        },
        {
          id: 'split', label: '刚/非刚项可分，或多时间尺度',
          title: '按谱与计算成本拆分，而不是按“线性/非线性”标签拆分',
          summary: 'IMEX 和 multirate 的价值在于让不同物理过程使用匹配的稳定性与分辨率；拆分同时引入耦合和交换子误差。',
          start: ['刚项隐式、非刚项显式：IMEX-ARK。', '快慢尺度差异显著且局部耦合可控：multirate / MRI 方法。'],
          upgrade: ['子算子可独立高效求解时使用 Strang 或更高阶 splitting。', '强耦合时转回单体隐式或迭代耦合，避免分裂误差主导。'],
          checks: ['各子算子谱与稳定限制', '耦合阶条件和交换子误差', '宏步/微步误差控制', '不同物理容差和守恒交换'],
          chapters: [11, 17]
        },
        {
          id: 'geometric', label: 'Hamilton、能量或流形约束',
          title: '先明确要保留的几何量，再选时间离散',
          summary: '辛、能量保持、变分和投影方法保护的结构不同。短时高阶并不等价于长期相位或不变量准确。',
          start: ['Hamilton 系统优先 symplectic/variational integrator。', '要求精确离散能量时使用 discrete-gradient 或 energy-preserving 方法。'],
          upgrade: ['非完整约束或流形动力学使用约束投影、SHAKE/RATTLE。', '耗散系统采用能量稳定或 metriplectic/GENERIC 一致离散。'],
          checks: ['长期能量误差是否有界而非单步最小', '辛形式、动量映射或约束残差', '相位误差和共振', '可变步长是否破坏目标结构'],
          chapters: [11, 15]
        }
      ]
    },
    pde: {
      label: 'PDE / 动理学',
      options: [
        {
          id: 'elliptic', label: '光滑椭圆问题或平衡方程',
          title: '几何复杂度决定离散，尺度结构决定求解器',
          summary: '结构网格上 FDM/FVM 简洁高效；复杂几何和弱边界更适合 FEM；极光滑规则域可使用谱方法。',
          start: ['规则域：高阶 FDM/FVM；复杂几何：连续 FEM；光滑周期域：Fourier/Chebyshev 谱法。', '线性系统使用稀疏直接法或 CG/GMRES + multigrid。'],
          upgrade: ['强各向异性用对齐网格、各向异性元或定制平滑器。', '自由边界或强非线性源项加入 Newton–Krylov 与连续化。'],
          checks: ['边界条件的弱/强施加一致性', '网格质量和坐标 Jacobian', '离散最大值、守恒或对称性', '网格收敛与预条件网格独立性'],
          chapters: [7, 8, 12, 13]
        },
        {
          id: 'conservation', label: '守恒律、激波或间断',
          title: '先保证通量守恒和非振荡，再追求高阶',
          summary: 'FVM 和 DG 以数值通量连接单元。重构、Riemann solver、限制器、正性和熵条件共同决定间断附近的可靠性。',
          start: ['FVM + Godunov/Rusanov/HLL 类通量；二阶用 MUSCL/TVD。', '高阶采用 WENO 或 DG，并配 SSP 时间积分。'],
          upgrade: ['低耗散与鲁棒性兼顾时使用 entropy-stable flux differencing/SBP。', '多物理强源项采用 well-balanced、IMEX 或 positivity-preserving source treatment。'],
          checks: ['局部/全局守恒误差', '正性、最大值和熵产生', '激波速度与接触间断分辨率', '边界数值通量和网格方向偏差'],
          chapters: [11, 12, 15]
        },
        {
          id: 'geometry', label: '复杂几何、高阶边界或嵌入域',
          title: '离散阶数不能超过几何和网格表示的有效阶数',
          summary: '曲边、薄层和高长宽比单元会把几何误差和条件数带入离散系统。网格质量是算法输入，不是后处理指标。',
          start: ['复杂体域使用等参 FEM/DG；边界条件弱施加可用 Nitsche。', '不愿贴体网格时使用 cut-cell、XFEM 或 immersed boundary。'],
          upgrade: ['高阶计算使用高阶曲边网格和适当几何映射。', '移动几何采用 ALE 或 conservative remap，并监控 geometric conservation law。'],
          checks: ['Jacobian 正性、skewness 和长宽比', '几何逼近误差与边界积分阶数', '小 cut cell 稳定限制', '网格运动中的守恒和重映射误差'],
          chapters: [12, 13, 15]
        },
        {
          id: 'freeboundary', label: '移动界面、自由边界或拓扑变化',
          title: '界面表示和场方程必须形成闭合的误差循环',
          summary: '贴体 ALE 精确表示界面但难处理拓扑变化；level set/phase field 易处理拓扑但需要控制质量、厚度和守恒。',
          start: ['界面平滑且拓扑固定：ALE/移动网格。', '存在合并分裂：level set、VOF、phase field 或 cut-cell。'],
          upgrade: ['界面条件强耦合时使用 monolithic Newton 或界面 quasi-Newton。', '平衡解族与 X 点拓扑变化结合伪弧长延拓和几何误差估计。'],
          checks: ['界面质量/体积守恒', '曲率和法向噪声', '重初始化与界面漂移', '拓扑事件前后的一致离散与求解收敛'],
          chapters: [8, 13, 15, 17, 18]
        },
        {
          id: 'integral', label: '外域、非局部核或边界积分',
          title: '降维到边界后，主要挑战转为奇异积分和稠密算子',
          summary: 'BEM/Nyström 对外域和 Green 函数问题很有吸引力，但离散矩阵稠密，近场奇异求积与远场快速算法缺一不可。',
          start: ['已知 Green 函数且边界维数低时用 BEM/Nyström。', '奇异/近奇异积分使用解析消奇、专用求积或自适应局部加密。'],
          upgrade: ['大规模稠密作用使用 FMM、H/H² matrix 或 FFT-based convolution。', '频率扫描使用低秩更新、block Krylov 或可复用层次表示。'],
          checks: ['第一/第二类积分方程的条件性', '奇异与近奇异求积误差', '远近场分离容差', '边界方向、跳跃关系和外域辐射条件'],
          chapters: [3, 4, 14]
        },
        {
          id: 'kinetic', label: 'Vlasov、Fokker–Planck 或 PIC',
          title: '在噪声、维数和守恒之间选择粒子或连续体表示',
          summary: 'PIC 避免相空间网格但有统计噪声；连续体方法更平滑却受维数灾难影响。碰撞、场耦合和长时间守恒决定方法组合。',
          start: ['高维无碰撞问题优先 PIC；平滑低维分布可用 semi-Lagrangian、FVM 或 DG。', 'Fokker–Planck 碰撞项使用保守、正性保持的隐式或 IMEX 离散。'],
          upgrade: ['噪声敏感目标增加粒子数、控制变量或 δf/PIC。', '高维连续体尝试 sparse grid、低秩张量或动态低秩。'],
          checks: ['电荷/质量、动量和能量守恒', 'Gauss 定律与电荷守恒沉积', '正性、数值扩散和 filamentation', '粒子噪声或低秩截断误差'],
          chapters: [11, 12, 15, 16, 22]
        }
      ]
    },
    inference: {
      label: '推断与加速',
      options: [
        {
          id: 'adjoint', label: '参数很多、目标量很少',
          title: '用伴随把梯度成本从参数维数中解耦',
          summary: '对隐式状态方程，伴随通过一次转置线性系统把状态敏感性压缩到目标方向；自动微分只是构造局部导数的工具。',
          start: ['先明确 continuous 还是 discrete adjoint；工程优化通常以离散伴随对齐代码目标。', '完成 Taylor remainder test，并为时间积分设计 checkpointing。'],
          upgrade: ['二阶优化使用 Hessian-vector product，而非显式 Hessian。', '形状优化加入 mesh derivative、shape calculus 或 level-set 参数化。'],
          checks: ['梯度 Taylor test 阶数', '转置预条件与边界条件', '非光滑操作和迭代停止对导数的影响', 'checkpointing 时间—内存权衡'],
          chapters: [7, 19]
        },
        {
          id: 'bayes', label: '反演、数据同化或不确定性',
          title: '先问可辨识性，再问最优参数',
          summary: '正则化、噪声模型和先验共同定义后验。单个最优值不能表达弱方向、参数相关性和模型失配。',
          start: ['低中维静态反演：MAP + Laplace；序贯状态估计：EnKF/变分同化。', '非高斯或强非线性后验使用 MCMC/SMC，但先构建降维和代理。'],
          upgrade: ['昂贵高保真模型结合 MLMC、multifidelity 和 control variate。', '高维参数用 active subspace、likelihood-informed subspace 或低秩 Hessian。'],
          checks: ['先验与噪声协方差的物理含义', '后验采样收敛与有效样本数', '可辨识方向和 posterior predictive check', '代理误差是否纳入后验'],
          chapters: [18, 19, 20]
        },
        {
          id: 'rom', label: '大量重复查询或实时计算',
          title: '降状态维数后，还要降低非线性评估成本',
          summary: 'POD/Reduced Basis 负责低维试验空间，DEIM/empirical quadrature 负责超降阶；在线速度必须与稳定性和误差证书一起评估。',
          start: ['快照 SVD/POD 建基，使用 Galerkin 或 Petrov–Galerkin 投影。', '非仿射或非线性项用 DEIM、gappy POD 或 empirical quadrature。'],
          upgrade: ['参数域宽时使用局部/自适应基、operator inference 或多保真模型。', 'Hamilton/守恒系统采用 symplectic 或 structure-preserving ROM。'],
          checks: ['训练域覆盖和外推检测', '投影误差、超降阶误差与时间积分稳定性', '在线成本是否真正独立于全维 n', '守恒、边界条件和误差回退机制'],
          chapters: [18, 21, 23]
        },
        {
          id: 'surrogate', label: '学习解算子或物理闭合',
          title: '代理模型应嵌入验证和高保真回退，而不是替代误差分析',
          summary: 'Neural operator 和闭合网络适合重复参数查询。它们学习的是训练分布中的映射，外推、守恒和刚性仍需传统数值工具审计。',
          start: ['输入输出为函数场时考虑 FNO/DeepONet；低维闭合先从标准 MLP/ensemble 基线开始。', '训练集按物理参数和网格分层，并保留严格独立的分布外测试。'],
          upgrade: ['加入硬约束投影、守恒修正、多保真残差学习和不确定性估计。', '把代理用于初值、预条件、闭合或局部加速，并保留高保真校正。'],
          checks: ['训练域边界和 OOD 检测', '守恒/稳定性/频谱而非只看点态 MSE', '网格与分辨率泛化', '下游目标量和闭环误差'],
          chapters: [21, 23]
        },
        {
          id: 'tensor', label: '高维参数或相空间存在低秩结构',
          title: '低秩方法有效与否取决于秩，而不是维数名称',
          summary: 'CP、Tucker 和 TT 通过可分结构压缩高维数组；算子作用、时间推进和截断过程中的秩增长决定实际复杂度。',
          start: ['网格张量结构明确时使用 Tucker/TT；时间演化可用 projector-splitting 动态低秩。', '每步截断设置与离散/时间误差匹配的容差。'],
          upgrade: ['维度二进制化可尝试 QTT；非线性项使用 cross approximation 或低秩算子。', '局部结构强时使用分块、混合基或自适应秩。'],
          checks: ['各方向 rank 与截断误差', '算子作用后的 rank explosion', '低秩流形投影误差', '小规模全维基准和守恒量'],
          chapters: [16, 22]
        },
        {
          id: 'hpc', label: '算法已正确，但性能受限',
          title: '先用 Roofline 判断瓶颈，再改数据布局和精度',
          summary: 'SpMV、stencil、FFT、稠密核的算术强度不同。盲目移植 GPU 或增加并行度可能只放大通信和内存瓶颈。',
          start: ['测量时间、带宽、FLOP、通信和内存峰值，建立 Roofline 基线。', '提高局部性、批处理和算子融合；避免不必要的全局同步。'],
          upgrade: ['内存受限核使用 matrix-free、压缩存储和通信规避 Krylov。', '条件允许时使用混合精度分解/预条件，并以高精度残差校正。'],
          checks: ['端到端时间而非单核峰值', '算术强度和实际带宽', '强/弱扩展及通信占比', '并行归约可复现性与精度损失'],
          chapters: [1, 7, 24]
        }
      ]
    }
  };
