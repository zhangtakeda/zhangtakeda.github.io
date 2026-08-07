<!-- 这个注释不要删除, 文档中尽可能使用中文叙述, 单段落不换行. 标点符号尽可能用英文的, 专有名词或不适合翻译的术语使用英文的 -->

# FusionPRIME 的架构设计

**FusionPRIME**: Fusion Plasma Reactive Integrated Modeling Environment

FusionPRIME 是面向聚变等离子体集成建模的反应式计算生态, 由 Harmonia-Energeia 核心架构和 Theoria 可视化层组成. 架构命名借用亚里士多德的一对概念, 对应结构定义与实际计算之间的分工:

- **Harmonia (和谐关系):** 静态的结构与关系, 包括契约, 元模型和 Workflow. 它定义系统中合法的组件及其组合方式, 本身不实现具体的重型物理计算.
- **Energeia (现实活动):** 从潜能到实现的动态过程, 即系统实际运行和产生结果的过程. 它包含 Module 的具体实现, 负责执行数值计算.
- **Theoria (理论和观察):** 延续这一命名体系, 表示对计算对象和结果的观察, 展示与理解.

具体到代码上:

|              | 职责                         | 主要概念                               |
| ------------ | ---------------------------- | -------------------------------------- |
| **Energeia** | 定义物理数据和单个物理过程   | Module、Adapter、Kernel、State、Record |
| **Harmonia** | 连接、求解、验收、求导并记录 | Workflow、Bundle、Cycle、History       |
| **Theoria**  | 可视化与交互呈现             | --                                     |

**OpenMDAO** 是 Harmonia 的一个重要依赖, 用于构建和求解多学科优化问题, 它允许用户定义模块化的物理模型后通过自动微分和数值方法计算总导数.

- 网页: https://openmdao.org
- 论文: https://doi.org/10.1007/s00158-019-02211-z
- 代码: https://github.com/OpenMDAO/OpenMDAO

**FusionPRIME 将 OpenMDAO 作为 Harmonia 的执行和导数底座.** `Record`、`Result`、`RunContext` 是 Energeia 定义、Harmonia 使用的不可变执行值；它们不得反向引用 `Workflow`、`History` 等对象。具体的关系如下图所示:

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

---

# FusionPRIME 的先进特性

## 1. 响应式数据流

**聚变模型中的物理量往往彼此依赖.** 例如平衡位形改变后, 磁面坐标, Jacobian, 体积和一维几何因子都应随之更新. 如果由开发者手动维护更新顺序和缓存:

1. 容易留下**数值看似正常但已经过期**的派生量;
2. 容易进行**大量多余的物理量计算**, 尤其体现在 IMAS 数据接口中;
3. 或者**不方便将计算延迟到真正需要的时间段**, 例如可视化阶段而不是计算阶段.

FusionPRIME 将独立输入定义为 root property, 其余物理量则直接按公式写成派生 property. 例如, 关系 $y = x^2, z = y + 1$ 可以表达为:

```python
class Derived(Reactive):
    root_properties = {"x"}

    def __init__(self, x):
        super().__init__()
        self.x = x

    @property
    def y(self):
        return self.x**2

    @property
    def z(self):
        return self.y + 1
```

系统会从公式中建立 `x → y → z` 的依赖关系. 修改 `x` 时只记录变化, 不立即执行下游计算; 下次读取 `y` 或 `z` 时, 系统才会检查依赖并按需更新. **未改变的分支继续复用缓存, 未访问的派生量不产生计算成本.**

```python
derived = Derived(2) # x = 2
print(derived.z) # 先自动进行 y 的计算, 再计算 z, 输出 5
derived.x = 3 # 修改 x, y 和 z 只标记为过期
print(derived.z) # 再次访问 z 时, 才进行计算 y = 9, 再计算 z = 10
```

**这种设计让物理公式同时成为可执行的依赖声明, 从而保证对象内部的一致性, 并将更新范围限制在真正受影响的数据上.** 常规依赖由 AST (Abstract Syntax Tree) 自动识别, 无法静态分析的动态依赖也可以通过 `depends_on` 显式声明.

Reactive 用于物理对象和派生诊断. 而数值热循环、残差评估、时间推进和非线性迭代仍由编译内核和显式 workspace 执行, 因此反应式语义不会进入高频计算路径.

## 2. 不受单一技术栈限制的可微 Workflow

FusionPRIME 可以计算完整 Workflow 的总导数, 从而分析任意输出对初始状态, 模型参数和控制量的敏感性, 并直接支持参数反演, 梯度优化和控制设计.

可微分是 Module 对外提供的能力, 而不是对内部实现方式的限制. Module 可以提供解析 Jacobian, JVP 或 VJP, 也可以在内部使用 AD, 隐式微分, complex step 或 finite difference. 因此, 同一个 Workflow 可以组合 Numba, JAX 或其他数值实现, 不要求所有模块和求解过程都改写为同一套 AD primitive.

导数能够自然地沿不同 Workflow 结构传播. 普通 Module 按数据流应用链式法则; Bundle 将输入扰动传播到各条独立分支, 并在反向传播时汇总来自各分支的梯度; Cycle 则在自洽解收敛后计算隐式导数, 而不需要反向展开求解器的迭代历史.

## 3. git-like 的数据管理
