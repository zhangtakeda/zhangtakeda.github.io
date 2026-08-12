<!-- 这个注释不要删除, 文档中尽可能使用中文叙述, 单段落不换行. 标点符号尽可能用英文的, 专有名词或不适合翻译的术语使用英文的 -->

# FusionPRIME 架构设计

**FusionPRIME**: Fusion Plasma Reactive Integrated Modeling Environment

FusionPRIME 是面向聚变等离子体集成建模的响应式计算生态, 由 Energeia-Harmonia 核心架构组成. 架构命名借用亚里士多德的一对概念, 对应可执行的物理过程与这些过程之间的组合关系:

- **Energeia (现实活动):** 表示可执行的物理过程. Energeia 计算域由公共 `energeia` 契约包和独立发行的物理 Module 共同组成; 前者定义 State, 执行与导数协议, 后者实现具体数值计算.
- **Harmonia (和谐关系):** 负责将 Module 组织为 Workflow, 求解跨物理过程的反馈关系, 并管理 State 版本, Commit 和 History.

物理模块设计的相关概念:

- **State:** 表示一类可在 Module 之间传递和版本化的物理状态, 同时携带网格, 时间等语义.
- **Adapter:** 在具体 Module 内部, 将合法的 State 转换为其 Kernel 所需的网格和时间切片.
- **Kernel:** Module 内部适合高频调用的数值计算核心, 不感知 State, 只进行纯粹的数值计算.
- **Record:** Module 执行的不可变记录, 保存求解状态和诊断, 通过验收时可物化 State.
- **Module:** 实现一个可独立运行的物理过程, 通过统一协议组织 Adapter, Kernel 和 Record.

工作流的组织和节点:

- **Bundle:** 共享输入但不存在相同输出的 Module 或子流程组合, 可以并行执行.
- **Cycle:** 包含跨物理反馈关系的耦合组合, 通过指定的非线性求解器获得自洽 State.
- **Workflow:** 由 Module, Bundle 和 Cycle 组成的串行物理计算流程.

状态更新和历史记录:

- **Commit:** 记录一个 Workflow 节点通过验收后的完整 State 版本号的组合. Module, Bundle, Cycle 只进行一次 Commit, Repeat, Workflow 进行多次 Commit.
- **Head:** History 对当前最新 Commit 的引用, 代表 Workflow 最近的完整物理状态.
- **History:** 保存具体的 State 版本序列, Commit 谱系和对应的执行 Record, 用于回溯, 比较和可视化 Workflow 在各节点的物理状态与执行过程.

`energeia` 是所有物理 Module 与 Harmonia 共同依赖的底层契约包. 它定义跨 Module 稳定的物理 State, 执行协议, 导数协议和公共数值原语, 但不包含具体物理求解器, 也不负责 Workflow 编排:

```text
energeia/
├── contract/
├── state/
│   ├── current/
│   ├── equilibrium/
│   ├── kinetic/
│   └── source/
├── numerics/
└── view/
```

每个具体 Module 都作为独立 Python 包发行, 并组织为一致的形式:

```text
veqpy/
├── adapter/
├── record/
├── kernel/
│   ├── cxx_kernel/
│   └── numba_kernel/
└── view/
```

Module 的公开入口接收 Energeia State, 由自己的 Adapter 完成坐标, 网格, 单位与时间切片转换, 再调用内部 Kernel. `energeia` 定义公共不可变的 Record, 用于保存一次 Module 具体求解过程的执行状态, 计时, 迭代计数, Kernel 与 fallback 路径, 错误摘要, provenance 以及 State 物化所需的输出. Module 内部的 `record` 将 Kernel 输出与诊断解释为该公共 Record. 只有通过求解与物理验收的 Record 才会物化为 State; 失败的 Record 返回 `State=None`, 其初始猜测, 最后迭代值和残差等候选数据仍保留在 Record 中, 供诊断, 可视化或后续热启动使用. Record 不反向引用 Workflow, Commit 或 History:

```text
State
    ↓
Adapter
    ↓
Module-specific Input
    ↓
Kernel
    ↓
Module-specific Output
    ↓
Record
├── succeed → State
└── failed  → None
```

每个 Module 还必须提供一致的命令行入口, 使其可以在不建立 Harmonia Workflow 的情况下独立检查和运行:

```bash
python -m veqpy --demo [numba|cxx]
python -m veqpy --version
python -m veqpy --check
python -m veqpy --links
```

**Harmonia** 是将 Module 组合为 Workflow, 并管理 State 版本组合, Commit, Head 和 History 的上层包. Harmonia 使用 Energeia 定义的物理 State 和执行协议, 但不定义具体物理字段, 也不依赖任何特定 Module:

```text
harmonia/
├── bundle/
├── cycle/
├── history/
├── module/
├── repeat/
├── view/
└── workflow/
```

实际依赖为:

```text
veqpy/mcdpy/vtspy → energeia
harmonia          → energeia
```

具体 Module 与 Harmonia 在 Python 包层面互为兄弟, 并共同依赖 `energeia`. 用户应用作为组合入口选择 Harmonia 与所需 Module; Harmonia 不直接导入任何具体 Module, Module 也不导入 Harmonia.

`energeia.view` 负责通用 State 的物理展示, Module 内部的 `view` 负责求解过程可视化, `harmonia.view` 则负责 Workflow, Commit 和 History 的跨节点展示.

## OpenMDAO

**OpenMDAO** 是 Harmonia 的一个重要依赖, 用于构建和求解多学科优化问题, 连接模块化的物理模型, 并根据各模块提供或数值近似的局部导数计算 Workflow 的总导数.

- 网页: https://openmdao.org
- 论文: https://doi.org/10.1007/s00158-019-02211-z
- 代码: https://github.com/OpenMDAO/OpenMDAO

**FusionPRIME 将 OpenMDAO 作为 Harmonia 的执行和总导数底座.** Harmonia 将 Workflow 编译为 OpenMDAO 计算图, 再通过 Energeia 的 Module 协议调用具体 Module. OpenMDAO 不拥有 State 版本, Commit 或 History, 具体 Module 也不感知 Workflow 的存在:

```text
[Harmonia]  Workflow / Bundle / Cycle / Commit / History
    |
    | compiles to
    v
[OpenMDAO]  execution / total derivatives
    |
    | invokes through the Energeia Module protocol
    v
[Modules]  VEQPy / MCDPy / VTSPy
    |
    | Module -> Adapter -> Kernel -> Record + State
    v
[Energeia]  State / contracts / numerics
```

## IMAS

**IMAS** (Integrated Modelling & Analysis Suite) 是 ITER 组织开发的聚变等离子体集成建模数据结构和接口标准, 核心由 Data Dictionary 和 Access Layer 组成. Data Dictionary 定义 IDS, 字段, 单位和坐标, Access Layer 提供对 IDS 的存储与访问接口. IDS 定义了聚变等离子体模拟中常用的物理量及其组织方式, API 定义了对 IDS 的访问方式.

- 网页: https://imas-python.readthedocs.io/en/stable/
- 论文: https://doi.org/10.1088/0029-5515/55/12/123006
- 代码: https://github.com/iterorganization/IMAS-Python

**FusionPRIME 可以从 IMAS IDS 初始化 State, 也可以将计算结果导出为 IMAS IDS.** IMAS 只存在于可选的数据交换边界, FusionPRIME 在 Workflow 运行过程中使用自己的 State, 不要求 IMAS-Python 成为核心依赖.

```text
[IMAS] IDS / Access Layer API
    |
    | optional import
    |
[FusionPRIME] State / Commit / History
    |
    | optional export
    |
[IMAS] IDS / Access Layer API
```

---

# FusionPRIME 的核心特性

## 1. 响应式数据流

- 解决单个物理对象内部的一致性
- 最小计算量以及惰性更新机制

**聚变模型中的物理量往往彼此依赖.** 例如平衡位形改变后, 磁面坐标, Jacobian, 体积和一维几何因子都应随之更新. 如果由开发者手动维护更新顺序和缓存:

1. 容易留下数值看似正常但已经过期的派生量;
2. 容易进行大量多余的物理量计算或更新;
3. 无法自动将计算延迟到真正需要它的阶段.

IMAS IDS 中往往存在大量相互关联但并非每次都需要的字段. 一个输入变化不应导致所有派生物理量都被重新计算, 面向 IMAS 的一次局部读取或字段映射也不需要先构造和填满所有可选派生字段. IMAS.jl 已经支持按需 expression, 但 dynamic expression 会在每次访问时重新计算, onetime expression 缓存后则需要开发者手动刷新.

FusionPRIME 通过显式依赖图和版本标记, 只在派生量首次被访问, 或其依赖变化后再次被访问时计算. FusionPRIME 因此显式声明独立的 root property, 并从派生 property 的物理公式中建立依赖关系.

Reactive 对象内部的属性依赖必须构成 DAG (Directed Acyclic Graph). 跨物理过程的反馈关系不表示为属性之间的循环依赖, 而由 Workflow 中的 Cycle 使用指定的非线性求解器求得自洽解.

例如, 关系 $y = x^2, z = ay, w = 2a$ 形成如下 DAG:

```text
x → y → z
a ────→ z
a ────→ w
```

```python
class Derived(Reactive):
    root_properties = {"x", "a"}

    def __init__(self, x, a):
        super().__init__()
        self.x = x
        self.a = a

    @property
    def y(self):
        return self.x**2

    @property
    def z(self):
        return self.a * self.y

    @property
    def w(self):
        return 2 * self.a
```

系统会自动建立多条依赖分支. 修改 `x` 时, 只有 `y` 和 `z` 可能失效; 如果从未访问 `w`, 则 `w` 从始至终都不会被计算. 对 `a` 的修改同理, **未改变的分支继续复用缓存, 未访问的派生量不产生计算成本.**

```python
derived = Derived(x=2, a=10)
print(derived.z)  # 只计算 y 和 z, 输出 40

derived.x = 3  # y 和 z 失效
print(derived.z)  # 重新计算 y 和 z, 输出 90

derived.a = 20  # z 失效, y 不受影响
print(derived.w)  # 此时 w 才进行第一次计算, 输出 40
```

**这种设计同时保证了更新的正确性, 计算范围的最小化和派生数据的延迟物化.** 常规依赖由 AST (Abstract Syntax Tree) 自动识别, 无法静态分析的动态依赖也可以通过 `depends_on` 显式声明.

Reactive 用于物理对象和派生诊断. 而数值热循环、残差评估、时间推进和非线性迭代仍由编译内核和显式 workspace 执行, 因此 Reactive 语义不会进入高频计算路径.

## 2. 异构可微 Workflow

- 声明好的物理组合关系如何成为 Workflow
- 从不同数值求解和导数形式的模块组合中获取总导数

FusionPRIME 可以计算完整 Workflow 中可微输出对初始状态, 模型参数和控制量的总导数, 并据此进行敏感性分析, 参数反演, 梯度优化和控制设计.

可微分是 Module 对外提供的能力, 而不是对内部实现方式的限制. 这避免了要求所有 Module 使用相同的数值实现或局部导数生成方式, 使得不同模块可以使用不同的数值求解和导数计算技术栈, 例如 Numba, JAX 或 PyTorch. Module 可以提供解析 Jacobian, JVP 或 VJP, 也可以在内部使用 AD, 隐式微分, complex step 或 finite difference. 因此, 同一个 Workflow 可以组合多种局部导数形式和代码实现, 不要求所有模块和求解过程都改写为同一套 AD primitive.

Module 对外提供的导数覆盖从输入 State 到输出 State 的完整映射, 因此也包括 Adapter 内的坐标与网格转换, 而不只是 Kernel 内部数组之间的导数. Harmonia 将 Module 提供的 Jacobian, JVP 或 VJP 统一为 OpenMDAO 可使用的局部线性算子; 同时提供 JVP 与 VJP 时, Workflow 可以根据设计变量与响应的维度选择 forward 或 reverse 总导数模式. 导数沿不同 Workflow 结构传播: 普通 Module 按数据流应用链式法则; Bundle 将输入扰动传播到各条独立分支, 并在反向传播时汇总来自各分支的梯度; Cycle 在自洽解收敛后求解耦合线性系统以获得隐式导数, 不需要反向展开非线性迭代历史. 如果完整的输入到输出路径包含未提供导数, 离散切换或不光滑操作, Workflow 则应显式使用数值近似或声明该路径不可微.

## 3. 基于 Commit 的 History 数据管理

- Commit 记录一个 Workflow 节点完成后完整的 State 版本组合, Head 指向当前 Commit
- 每次提交只增加实际产生的 State, 未变化的 State 继续复用已有版本
- 任意节点的完整物理状态都可以还原、比较和可视化

**集成模拟的当前状态不是单个数据对象, 而是多个物理 State 版本的组合.** FusionPRIME 将每个物理 State 独立保存为版本序列, 并由每个 Commit 记录一个 Workflow 节点执行后的完整 State 版本组合. Head 是 History 对当前 Commit 的引用, 不另外复制或持有一份状态集合.

```text
History: (Equilibrium, Core Profiles, Sources)
C0  INIT  (0, 0, 0)
C1  VEQ   (1, 0, 0)
C2  VTS   (1, 1, 1) ← Head
```

一次 Commit 只增加本次实际产生的 State, 未变化的 State 继续复用已有版本. 因此, 每个 Commit 都可以还原节点完成后的完整物理状态, 但无须复制或重建整个 State 集合. State 版本与产生它的 Record 建立明确关联, 并可追溯至所属的 Module, Bundle 或 Cycle. 失败的 Record 可以作为执行轨迹保留, 但不物化 State, 也不创建 Commit; 只有新的 Commit 才会使 Head 向前移动.

IMAS 已经按照 equilibrium, core profiles, sources 等物理概念划分 IDS, 也允许独立读写单个 IDS, 但没有统一管理各 IDS 的版本谱系, 也没有由一个 Commit 统一记录当前完整 IDS 版本组合的机制. FusionPRIME 的 History 保存计算结果, 也可以快速还原任意节点的完整物理状态, 追踪每个 State 版本的产生来源, 并基于紧凑的版本数据进行逐节点可视化和结果比较.

## 4. 面向高性能计算的职责分离架构

FusionPRIME 通过 State, Adapter, Kernel 与 Record 分离物理状态, 模块数据转换, 高频计算和求解过程记录. Module 只读取和产生显式声明的 State, 不持有或修改 History 中的完整状态组合, 也不感知 Workflow, Commit 和 History. Harmonia 只将通过验收的 Record 所物化的 State 发布为新版本并创建 Commit. Module 执行失败或 Cycle 未通过收敛与验收条件时, 只产生失败的 Record, 不物化半成品 State, 不创建 Commit, Head 也不移动.

Adapter 属于 Module, 因为只有 Module 知道自己 Kernel 所需的坐标, 网格, 边界与守恒语义. 不同 State 可以使用不同网格, 但每个剖面都必须携带明确的坐标和几何语义; Module 内部使用 `energeia.numerics` 提供的公共插值, 投影与守恒重映射原语, 并根据物理量选择正确的转换方式. 同一个已编译 Workflow 中允许各 State 使用不同网格, 但网格点数和坐标拓扑在运行期间保持不变; 改变拓扑时应重新编译 Workflow. 这样既保留了 Module 对任意合法网格的适配能力, 又避免不同 Module 重复实现不一致的数值操作.

Reactive 只用于低频的物理对象与派生诊断, Adapter 只在 Module 边界执行必要的数据转换, Kernel 则通过编译内核, 预分配 workspace 和热启动求解保持高频残差评估的低开销. 架构边界因此不会被带入数值热循环.

## 5. 从独立 Module 到集成 Workflow

VEQ, MCD, VTS 等 Module 首先都是可以独立运行, 配置, 验证和诊断的完整物理过程. 用户可以直接调用 Module 的 Python API 或命令行入口, 不需要先建立 FusionPRIME Workflow. 同一个 Module 对独立调用和 Harmonia 提供相同的 State 输入, Record 与可选 State 输出以及导数协议, 因此单模块验证与集成 Workflow 不会演化成两套实现.

## 6. 用物理关系组织计算, 而不是手写 Driver

Module 表示一个物理过程, Bundle 表示共享输入但可以独立执行的并行分支, Cycle 则表示需要联立求解的物理反馈关系. 用户只声明物理过程的组合与 Cycle 的求解和验收条件, Harmonia 负责数据传递, 执行顺序, 并行调度, 反馈迭代, 总导数和 History 记录. 因此, 更换 Module, 重组 Bundle 或改变 Cycle 求解器不需要重写一个命令式 Driver.

```python
Workflow(
    VEQ(),
    Bundle(
        FusionHeating(),
        MCD(),
    ),
    Cycle(
        VTS(),
        VEQ(),
        solver=Picard(atol=1e-6),
    ),
)
```
