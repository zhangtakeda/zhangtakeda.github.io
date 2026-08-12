<!-- 文档中尽可能使用中文叙述, 单段落不换行. 标点符号尽可能用英文的, 专有名词或不适合翻译的术语使用英文的 -->

# FusionPRIME 架构设计

**FusionPRIME**: Fusion Plasma Reactive Integrated Modeling Environment

FusionPRIME 是面向聚变等离子体集成建模的响应式计算生态, 由 Energeia-Harmonia 核心架构组成. 架构命名借用亚里士多德的一对概念, 对应结构定义与实际计算之间的分工:

- **Energeia (现实活动):** 表示可执行的物理过程。Energeia 计算域由公共 energeia 契约包和独立发行的物理 Module 共同组成；前者定义 State、执行与导数协议，后者实现具体数值计算。
- **Harmonia (和谐关系):** 负责将 Module 组织为 Workflow，求解跨物理过程的反馈关系，并管理 State 版本、Commit 和 History。

主要概念:

- Adapter、Kernel
- State、Record
- Bundle、Cycle、Module
- Workflow、Commit、History

**Energeia** 是所有物理 Module 与 Harmonia 共同依赖的底层契约包. 它定义跨 Module 稳定的物理 State、执行协议、导数协议和公共数值, 但不包含具体物理求解器, 也不负责 Workflow 编排:

```text
Energeia/
├── __init__.py
├── __main__.py
├── contract/
├── state/
│   ├── __init__.py
│   ├── current/
│   ├── equilibrium/
│   └── kinetic/
├── numerics/
└── view/
```

**Module** 都组织为一致的形式:

```text
veqpy/
├── __init__.py
├── __main__.py
├── adapter/
├── kernel/
│   ├── __init__.py
│   ├── cxx_kernel/
│   └── numba_kernel/
└── record/
```

```bash
python -m veqpy --demo [optional numba/cxx]
python -m veqpy --version
python -m veqpy --check
python -m veqpy --links
```

```text
Energeia State
    ↓
Module-owned Adapter
    ↓
Module-specific Input
    ↓
Kernel
    ↓
Module-specific Output
    ↓
Energeia State + Module-owned Record
```

**Harmonia** 是将 Module 组合为 Workflow, 并管理 State 版本组合、Commit、HEAD 和 History 的上层包. Harmonia 使用 Energeia 定义的物理 State 和执行协议, 但不定义具体物理字段, 也不依赖任何特定 Module:

```text
Harmonia
├── __init__.py
├── __main__.py
├── bundle/
├── cycle/
├── history/
├── view/
└── workflow/
```

实际依赖为:

```text
veqpy/mcdpy/vtspy → energeia
harmonia          → energeia
```

用户调用:

```python
import harmonia
import mcdpy
import veqpy
import vtspy
```

## OpenMDAO

**OpenMDAO** 是 Harmonia 的一个重要依赖, 用于构建和求解多学科优化问题, 连接模块化的物理模型, 并根据各模块提供或数值近似的局部导数计算 Workflow 的总导数.

- 网页: https://openmdao.org
- 论文: https://doi.org/10.1007/s00158-019-02211-z
- 代码: https://github.com/OpenMDAO/OpenMDAO

**FusionPRIME 将 OpenMDAO 作为 Harmonia 的执行和导数底座.** `Record`、`Result` 是 Energeia 定义、Harmonia 使用的不可变执行值；它们不得反向引用 `Workflow`、`History` 等对象。具体的关系如下图所示:

```text
[Harmonia]  Workflow / Bundle / Cycle / History
    |
    | compiles to
    |
[OpenMDAO]
    |
    | calls
    |
[Energeia]  State / Module / Adapter / Kernel
```

## IMAS

**IMAS** (Integrated Modelling & Analysis Suite) 是 ITER 组织开发的聚变等离子体集成建模数据结构和接口标准, 核心由 Data Dictionary 和 Access Layer 组成. Data Dictionary 定义 IDS、字段、单位和坐标, Access Layer 提供对 IDS 的存储与访问接口. IDS 定义了聚变等离子体模拟中常用的物理量及其组织方式, API 定义了对 IDS 的访问方式.

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

Reactive 对象内部的属性依赖必须构成 DAG (Directed Acyclic Graph). 跨物理过程的反馈闭环不表示为属性之间的循环依赖, 而由 Workflow 中的 Cycle 使用指定的非线性求解器求得自洽解.

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

FusionPRIME 可以计算完整 Workflow 的总导数, 从而分析任意输出对初始状态, 模型参数和控制量的敏感性, 并直接支持参数反演, 梯度优化和控制设计.

可微分是 Module 对外提供的能力, 而不是对内部实现方式的限制. 这避免了要求所有 Module 使用相同的数值实现或局部导数生成方式, 使得不同模块可以使用不同的数值求解和导数计算技术栈, 例如 Numba、JAX、PyTorch 等等. 同时 Module 可以提供解析 Jacobian, JVP 或 VJP, 也可以在内部使用 AD, 隐式微分, complex step 或 finite difference. 因此, 同一个 Workflow 的微分形式可以组合多种数值近似和代码实现, 不要求所有模块和求解过程都改写为同一套 AD primitive.

导数能够自然地沿不同 Workflow 结构传播. 普通 Module 按数据流应用链式法则; Bundle 将输入扰动传播到各条独立分支, 并在反向传播时汇总来自各分支的梯度; Cycle 则在自洽解收敛后计算隐式导数, 而不需要反向展开求解器的迭代历史.

## 3. 基于 Commit 的 History 数据管理

- Commit 记录完整的 State 版本组合, HEAD 指向 Workflow 当前的 StateMap
- 每次提交只增加实际产生的 State, 未变化的 State 继续复用已有版本
- 任意节点的完整物理状态都可以还原、比较和可视化

**集成模拟的当前状态不是单个数据对象, 而是多个物理 State 版本的组合.** FusionPRIME 将每个物理 State 独立保存为版本序列, 并由 Commit 记录一个 Workflow 节点执行后的完整 State 版本组合.

```text
StateMap: (Equilibrium, Core Profiles, Sources)
C0  INIT  (0, 0, 0)
C1  VEQ   (1, 0, 0)
C2  VTS   (1, 1, 1) ← HEAD
```

一次 Commit 只增加本次实际产生的 State, 未变化的 State 继续复用已有版本. 因此, 每个节点都具有完整的 StateMap, 但无须复制或重建整个 State 集合. State 版本同时与产生它的 Module、Bundle 或 Cycle Result 建立明确关联.

IMAS 已经按照 equilibrium、core profiles、sources 等物理概念划分 IDS, 也允许独立读写单个 IDS, 但没有统一管理各 IDS 的版本谱系, 也没有将不同 IDS 版本组成 Workflow HEAD 的 Commit 机制. FusionPRIME 的 History 因而不仅保存计算结果, 还可以快速还原任意节点的完整物理状态, 追踪每个 State 版本的产生来源, 并基于紧凑的版本数据进行逐节点可视化和结果比较.

## 4. 面向高性能计算的职责分离架构

> 可以提供一段 prompt 用于给指定模块的架构设计评分

- FusionPRIME 可以在设计上更结构化的同时保持显著的性能优势
- Module 从接口上就没有能力观察或修改职责范围之外的状态
- 在物理状态封装、模块接口约束以及计算与结果发布的分离上更彻底

例如 FusionPRIME 中, 每个 Module 只读取和写入显式声明的物理字段, 不直接持有并任意修改整棵全局数据, 即 Module 不会感知到 Workflow 和 History.

## 5. 从独立 Module 到集成 Workflow

VEQ、MCD、VTS 等 Module 首先都是可以独立运行、配置、验证和诊断的完整物理过程. 用户不需要先建立整个 FusionPRIME Workflow, 才能使用其中一个求解器或 API.

## 6. 用物理关系组织计算，而不是手写 Driver

```python
Workflow(
    VEQ(...),
    Bundle(
        FusionHeating(...),
        MCD(...),
    ),
    Cycle(
        VTS(...),
        VEQ(...),
        solver=Picard(atol=1e-6),
    ),
)
```
